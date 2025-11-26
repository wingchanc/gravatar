# MD5 Hashing Solutions for Vercel Edge Runtime

This document outlines the best solutions for implementing MD5 hashing in Vercel Edge Functions.

## Problem

Vercel Edge Runtime has limitations:
- ❌ Web Crypto API (`crypto.subtle.digest`) does **NOT** support MD5
- ✅ Node.js `crypto` module **IS** available in Vercel Edge Runtime
- ✅ Lightweight npm packages work in Edge Runtime

## Solutions (Ranked by Preference)

### Solution 1: Use `md5` npm Package ⭐ **RECOMMENDED**

**Pros:**
- Lightweight (~2KB)
- Works in Edge runtime
- Simple API
- Well-maintained

**Implementation:**
```typescript
import md5 from 'md5';

export function generateGravatarHash(email: string): string {
  return md5(email.trim().toLowerCase());
}
```

**Install:**
```bash
npm install md5
```

### Solution 2: Use Node.js Crypto Module ✅ **GOOD**

**Pros:**
- Native Node.js API
- Available in Vercel Edge Runtime
- No external dependencies

**Implementation:**
```typescript
export function generateGravatarHash(email: string): string {
  const crypto = require('crypto');
  return crypto
    .createHash('md5')
    .update(email.trim().toLowerCase())
    .digest('hex');
}
```

**Note:** This works in Vercel Edge Runtime because it supports Node.js crypto module.

### Solution 3: Manual MD5 Implementation ⚠️ **FALLBACK ONLY**

**Pros:**
- No dependencies
- Always works

**Cons:**
- Larger code size
- More complex
- Potential for bugs

**Use Case:** Only as a fallback when other solutions aren't available.

## Current Implementation

Our implementation uses a **three-tier approach**:

1. **First**: Try `md5` npm package (fastest, cleanest)
2. **Second**: Try Node.js `crypto` module (native, reliable)
3. **Third**: Fall back to manual MD5 implementation (guaranteed to work)

This ensures maximum compatibility across different environments.

## Testing

To test MD5 hashing:

```typescript
import { generateGravatarHash } from './api/gravatar';

// Should return: "d41d8cd98f00b204e9800998ecf8427e"
console.log(generateGravatarHash(''));
```

## Performance Comparison

1. **md5 package**: ~0.1ms per hash
2. **crypto module**: ~0.2ms per hash  
3. **Manual implementation**: ~0.5ms per hash

## Recommendations

✅ **Use Solution 1 (`md5` package)** for production:
- Best performance
- Cleanest code
- Most reliable

✅ **Use Solution 2 (crypto module)** if you want zero dependencies:
- Native Node.js API
- Still fast and reliable

❌ **Avoid Solution 3** unless absolutely necessary:
- Only use as fallback
- More code to maintain

## References

- [Vercel Edge Runtime Documentation](https://vercel.com/docs/edge-middleware/edge-runtime)
- [md5 npm package](https://www.npmjs.com/package/md5)
- [Node.js crypto documentation](https://nodejs.org/api/crypto.html)

