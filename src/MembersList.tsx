import React, { useEffect, useState } from "react";
import * as Icons from "@wix/wix-ui-icons-common";
import {
  Box,
  Card,
  Table,
  TableToolbar,
  Button,
  Loader,
  Text,
  Divider,
  SectionHelper,
  Dropdown,
  Search,
} from "@wix/design-system";
import "@wix/design-system/styles.global.css";

interface Member {
  id: string;
  name: string;
  email: string;
  hasAvatar: boolean;
  avatarUrl: string;
}

interface MembersListProps {
  onBack: () => void;
}

const MembersList: React.FC<MembersListProps> = ({ onBack }) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updateResults, setUpdateResults] = useState<{
    success: string[];
    failed: { memberId: string; error: string }[];
  } | null>(null);
  const [filter, setFilter] = useState({
    avatarStatus: { id: '0', value: 'All Members' },
    name: '',
  });

  const API_BASE_URL = "/api";

  useEffect(() => {
    fetchMembers();
  }, []);

  // Filter members based on filter state
  useEffect(() => {
    let filtered = members;

    // Filter by avatar status
    if (filter.avatarStatus.value === 'Has Avatar') {
      filtered = filtered.filter((member) => member.hasAvatar);
    } else if (filter.avatarStatus.value === 'No Avatar') {
      filtered = filtered.filter((member) => !member.hasAvatar);
    }

    // Filter by name/email search
    if (filter.name) {
      const searchTerm = filter.name.toLowerCase();
      filtered = filtered.filter(
        (member) =>
          member.name.toLowerCase().includes(searchTerm) ||
          member.email.toLowerCase().includes(searchTerm)
      );
    }

    setFilteredMembers(filtered);
  }, [members, filter]);

  const fetchMembers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const instance = new URLSearchParams(window.location.search).get("instance");
      const url = instance
        ? `${API_BASE_URL}/members?instance=${encodeURIComponent(instance)}`
        : `${API_BASE_URL}/members`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setMembers(data.members || []);
      setIsLoading(false);
    } catch (err: any) {
      console.error("Error fetching members:", err);
      setError(err.message || "Failed to fetch members");
      setIsLoading(false);
    }
  };

  const handleBulkUpdate = async (idsToUpdate?: string[]) => {
    const memberIds = idsToUpdate || selectedIds;
    if (memberIds.length === 0) {
      setError("Please select at least one member");
      return;
    }

    try {
      setIsUpdating(true);
      setError(null);
      setUpdateResults(null);

      const instance = new URLSearchParams(window.location.search).get("instance");
      const url = instance
        ? `${API_BASE_URL}/bulk-update-avatars?instance=${encodeURIComponent(instance)}`
        : `${API_BASE_URL}/bulk-update-avatars`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ memberIds }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const results = await response.json();
      setUpdateResults(results);
      
      // Refresh the members list
      await fetchMembers();
      
      // Clear selection
      setSelectedIds([]);
    } catch (err: any) {
      console.error("Error updating avatars:", err);
      setError(err.message || "Failed to update avatars");
    } finally {
      setIsUpdating(false);
    }
  };

  const columns = [
    { title: "Name", render: (row: Member) => row.name },
    { title: "Email", render: (row: Member) => row.email },
    {
      title: "Avatar Status",
      render: (row: Member) => (
        <Box verticalAlign="middle">
          {row.hasAvatar ? (
            <Icons.Check size="24px" />
          ) : (
            <Icons.X size="24px" />
          )}
        </Box>
      ),
    },
  ];

  const MainToolbar = () => {
    return (
      <TableToolbar>
        <TableToolbar.ItemGroup position="start">
          <TableToolbar.Item>
            <TableToolbar.Label>
              {filteredMembers.length} {filteredMembers.length === 1 ? 'member' : 'members'}
              {filteredMembers.length !== members.length && ` of ${members.length}`}
            </TableToolbar.Label>
          </TableToolbar.Item>
          <TableToolbar.Item>
            <Dropdown
              options={[
                { id: '0', value: 'All Members' },
                { id: '1', value: 'Has Avatar' },
                { id: '2', value: 'No Avatar' },
              ]}
              selectedId={filter.avatarStatus.id}
              border="round"
              size="small"
              popoverProps={{ appendTo: 'window' }}
              onSelect={(avatarStatus: any) => setFilter({ ...filter, avatarStatus })}
              valueParser={({ value }) => value}
            />
          </TableToolbar.Item>
        </TableToolbar.ItemGroup>
        <TableToolbar.ItemGroup position="end">
          <TableToolbar.Item>
            <Search
              size="small"
              onChange={(event) =>
                setFilter({ ...filter, name: event.target.value })
              }
              onClear={() => setFilter({ ...filter, name: '' })}
            />
          </TableToolbar.Item>
          <TableToolbar.Item>
            <Button
              skin="inverted"
              size="small"
              prefixIcon={<Icons.ArrowLeft />}
              onClick={onBack}
            >
              Back
            </Button>
          </TableToolbar.Item>
        </TableToolbar.ItemGroup>
      </TableToolbar>
    );
  };

  const ActionsToolbar = ({ selectedCount, getSelectedIds, clearSelection }: any) => {
    const handleSelectAll = () => {
      const allIds = filteredMembers.map((m) => m.id);
      const currentSelectedIds = getSelectedIds ? getSelectedIds() : selectedIds;
      if (currentSelectedIds.length === allIds.length) {
        setSelectedIds([]);
        if (clearSelection) {
          clearSelection();
        }
      } else {
        setSelectedIds(allIds);
      }
    };

    const handleBulkUpdateClick = async () => {
      const idsToUpdate = getSelectedIds ? getSelectedIds() : selectedIds;
      if (idsToUpdate.length === 0) {
        setError("Please select at least one member");
        return;
      }
      await handleBulkUpdate(idsToUpdate);
    };

    return (
      <TableToolbar>
        <TableToolbar.ItemGroup position="start">
          <TableToolbar.Item>
            <TableToolbar.Label>{`${selectedCount} selected`}</TableToolbar.Label>
          </TableToolbar.Item>
          <TableToolbar.Item>
            <Box height="18px">
              <Divider direction="vertical" />
            </Box>
          </TableToolbar.Item>
          <TableToolbar.Item layout="button">
            <Button
              skin="inverted"
              size="small"
              onClick={handleSelectAll}
              disabled={isUpdating}
            >
              {(getSelectedIds ? getSelectedIds() : selectedIds).length === filteredMembers.length
                ? "Deselect All"
                : "Select All"}
            </Button>
          </TableToolbar.Item>
          <TableToolbar.Item layout="button">
            <Button
              size="small"
              prefixIcon={<Icons.UploadExportSmall />}
              onClick={handleBulkUpdateClick}
              disabled={isUpdating || selectedCount === 0}
            >
              {isUpdating ? "Updating..." : "Update Avatars"}
            </Button>
          </TableToolbar.Item>
        </TableToolbar.ItemGroup>
        <TableToolbar.ItemGroup position="end">
          <TableToolbar.Item>
            <Button
              skin="inverted"
              size="small"
              prefixIcon={<Icons.ArrowLeft />}
              onClick={onBack}
              disabled={isUpdating}
            >
              Back
            </Button>
          </TableToolbar.Item>
        </TableToolbar.ItemGroup>
      </TableToolbar>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <Box padding="SP6" direction="vertical" verticalAlign="middle" gap="SP2">
          <Loader text="Loading members..." />
        </Box>
      </Card>
    );
  }

  return (
    <Box direction="vertical" gap="SP3">
      {error && (
        <SectionHelper
          title="Error"
          skin="danger"
          onClose={() => setError(null)}
        >
          <Text size="small">{error}</Text>
        </SectionHelper>
      )}

      {updateResults && (
        <SectionHelper
          title="Update Results"
          skin={
            updateResults.failed.length === 0 ? "success" : "warning"
          }
          onClose={() => setUpdateResults(null)}
        >
          <Box direction="vertical" gap="SP1">
            <Text size="small">
              Successfully updated: {updateResults.success.length} members
            </Text>
            {updateResults.failed.length > 0 && (
              <Text size="small">
                Failed: {updateResults.failed.length} members
              </Text>
            )}
          </Box>
        </SectionHelper>
      )}

      <Card hideOverflow>
        <Table
          data={filteredMembers}
          columns={columns}
          showSelection
          selectedIds={selectedIds}
          onSelectionChanged={(ids: any) => setSelectedIds(ids)}
        >
          <Table.ToolbarContainer>
            {(selectionContext: any) =>
              selectionContext.selectedCount === 0
                ? MainToolbar()
                : ActionsToolbar({ ...selectionContext })
            }
          </Table.ToolbarContainer>
          <Table.Content />
        </Table>
      </Card>
    </Box>
  );
};

export default MembersList;

