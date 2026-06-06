const router = require('express').Router();
const auth = require('../middleware/auth');
const UserSettings = require('../models/UserSettings');

router.use(auth);

const DEFAULT_CATEGORIES = [
  { id: 'server', label: 'Servidor',      color: '#4f8fff', builtIn: true },
  { id: 'web',    label: 'Web / App',      color: '#3ecf8e', builtIn: true },
  { id: 'db',     label: 'Base de Datos',  color: '#fbbf24', builtIn: true },
  { id: 'vpn',    label: 'VPN / Red',      color: '#2dd4bf', builtIn: true },
  { id: 'other',  label: 'Otro',           color: '#888888', builtIn: true }
];

// Ensure built-in categories always present (migration safe)
function ensureBuiltins(categories = []) {
  const existing = categories.map(c => c.id);
  const missing = DEFAULT_CATEGORIES.filter(d => !existing.includes(d.id));
  return [...missing, ...categories];
}

// GET settings — always returns valid object, creates defaults if missing
router.get('/', async (req, res) => {
  try {
    let settings = await UserSettings.findOne({ userId: req.user.id });
    if (!settings) {
      settings = await UserSettings.create({ userId: req.user.id });
    }
    // Migration: ensure builtins exist for old users
    const fixed = ensureBuiltins(settings.categories || []);
    if (fixed.length !== (settings.categories || []).length) {
      settings.categories = fixed;
      await settings.save();
    }
    res.json(settings);
  } catch (e) {
    // Never crash — return safe defaults
    console.error('GET /settings error:', e);
    res.json({
      categories: DEFAULT_CATEGORIES,
      customFields: [],
      fieldOrder: []
    });
  }
});

// PUT update categories
router.put('/categories', async (req, res) => {
  try {
    const { categories } = req.body;
    if (!Array.isArray(categories)) return res.status(400).json({ error: 'categories debe ser array' });
    // Always keep builtins
    const safe = ensureBuiltins(categories);
    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.user.id },
      { categories: safe },
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
