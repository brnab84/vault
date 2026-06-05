const router = require('express').Router();
const auth = require('../middleware/auth');
const Entry = require('../models/Entry');

// All routes require auth
router.use(auth);

// GET all entries for user
router.get('/', async (req, res) => {
  try {
    const entries = await Entry.find({ userId: req.user.id }).sort({ updatedAt: -1 });
    res.json(entries);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create entry
router.post('/', async (req, res) => {
  try {
    const entry = await Entry.create({ ...req.body, userId: req.user.id });
    res.json(entry);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update entry
router.put('/:id', async (req, res) => {
  try {
    const entry = await Entry.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      req.body,
      { new: true }
    );
    if (!entry) return res.status(404).json({ error: 'No encontrado' });
    res.json(entry);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE entry
router.delete('/:id', async (req, res) => {
  try {
    const entry = await Entry.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!entry) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE all entries for user
router.delete('/', async (req, res) => {
  try {
    await Entry.deleteMany({ userId: req.user.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
