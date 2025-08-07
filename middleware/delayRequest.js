/**
 * Middleware to simulate request delay
 * @param {number} delayMs - Delay in milliseconds (default: 1000ms)
 * @returns {Function} Express middleware function
 */
function delayRequest(delayMs = 1000) {
  return function(req, res, next) {
    // Only apply delay in development environment
    setTimeout(() => {
        next();
      }, delayMs);
  };
}

module.exports = delayRequest;
