const router = require('express').Router();
const userCtx = require('../middleware/userContext');
const { getStatus } = require('../utils/gamify');

// GET /api/gamify/status — XP / level / title / combo / today's surprise
router.get('/status', userCtx, (req, res) => {
  res.json(getStatus(req.userId));
});

module.exports = router;
