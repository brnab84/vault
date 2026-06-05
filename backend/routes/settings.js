const router = require('express').Router();
const auth = require('../middleware/auth');
const UserSettings = require('../models/UserSettings');

router.use(auth);

// GET settings (create defaults if not exist)
router.get('/', async (req, res) => {
  try {
    let settings = await UserSettings.findOne({ userId: req.user.id });
    if (!settings) {
      settings = await UserSettings.create({ userId: req.user.id });
    }
    res.json(settings);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update categories
router.put('/categories', async (req, res) => {
  try {
    const { categories } = req.body;
    if (!Array.isArray(categories)) return res.status(400).json({ error: 'categories debe ser array' });
    // Preserve built-in categories, allow adding/editing custom ones
    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.user.id },
      { categories },
      { new: true, upsert: true }
    );
    res.json(settings);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update custom fields + optional fieldOrder
router.put('/fields', async (req, res) => {
  try {
    const { customFields, fieldOrder } = req.body;
    if (!Array.isArray(customFields)) return res.status(400).json({ error: 'customFields debe ser array' });
    const update = { customFields };
    if (Array.isArray(fieldOrder)) update.fieldOrder = fieldOrder;
    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.user.id },
      update,
      { new: true, upsert: true }
    );
    res.json(settings);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE custom category (only non built-in)
router.delete('/categories/:id', async (req, res) => {
  try {
    const settings = await UserSettings.findOne({ userId: req.user.id });
    if (!settings) return res.status(404).json({ error: 'No encontrado' });
    const cat = settings.categories.find(c => c.id === req.params.id);
    if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });
    if (cat.builtIn) return res.status(400).json({ error: 'No se pueden eliminar categorías predefinidas' });
    settings.categories = settings.categories.filter(c => c.id !== req.params.id);
    await settings.save();
    res.json(settings);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE custom field
router.delete('/fields/:id', async (req, res) => {
  try {
    const settings = await UserSettings.findOne({ userId: req.user.id });
    if (!settings) return res.status(404).json({ error: 'No encontrado' });
    settings.customFields = settings.customFields.filter(f => f._id.toString() !== req.params.id);
    await settings.save();
    res.json(settings);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
