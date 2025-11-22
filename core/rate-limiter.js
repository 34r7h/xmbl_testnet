/**
 * Rate limiter for DoS protection
 * Uses token bucket algorithm
 */

export class RateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 100;
    this.windowMs = options.windowMs || 60000; // 1 minute default
    this.buckets = new Map(); // key -> { tokens, resetTime }
  }

  /**
   * Check if request is allowed
   * @param {string} key - Identifier for rate limiting (IP, user ID, etc.)
   * @returns {boolean} - true if allowed, false if rate limited
   */
  isAllowed(key) {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now > bucket.resetTime) {
      // Create new bucket or reset expired bucket
      this.buckets.set(key, {
        tokens: this.maxRequests - 1,
        resetTime: now + this.windowMs
      });
      return true;
    }

    if (bucket.tokens > 0) {
      bucket.tokens--;
      return true;
    }

    return false;
  }

  /**
   * Get remaining tokens for a key
   * @param {string} key - Identifier
   * @returns {number} - Remaining tokens
   */
  getRemaining(key) {
    const bucket = this.buckets.get(key);
    if (!bucket || Date.now() > bucket.resetTime) {
      return this.maxRequests;
    }
    return bucket.tokens;
  }

  /**
   * Clean up expired buckets
   */
  cleanup() {
    const now = Date.now();
    for (const [key, bucket] of this.buckets.entries()) {
      if (now > bucket.resetTime) {
        this.buckets.delete(key);
      }
    }
  }
}

/**
 * Middleware for rate limiting requests
 */
export function rateLimitMiddleware(limiter, getKey = (req) => req.ip || 'unknown') {
  return (req, res, next) => {
    const key = getKey(req);
    
    if (!limiter.isAllowed(key)) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    
    next();
  };
}

