// This proxy is no longer used. The Reviews page no longer pulls
// testimonials from any third-party vouch platform.
module.exports = function disabled(req, res) {
  res.statusCode = 410;
  res.end('Gone');
};
