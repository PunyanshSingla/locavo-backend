const Availability = require('../models/Availability');

// @desc    Get available slots for a provider on a given date
// @route   GET /api/v1/availability/:providerId?date=YYYY-MM-DD
// @access  Public
exports.getAvailability = async (req, res) => {
  try {
    const { providerId } = req.params;
    const date = req.query.date;

    if (!date) {
      return res.status(400).json({ success: false, error: 'date query param required (YYYY-MM-DD)' });
    }

    const record = await Availability.findOne({ providerId, date });
    const slots = record ? record.slots : [];

    res.status(200).json({ success: true, data: { date, slots, availabilityId: record?._id } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Provider sets/replaces slots for a date
// @route   POST /api/v1/availability
// @access  Private (Provider)
exports.setAvailability = async (req, res) => {
  try {
    const { date, slots } = req.body; // slots: [{startTime, endTime}]

    if (!date || !Array.isArray(slots)) {
      return res.status(400).json({ success: false, error: 'date and slots array are required' });
    }

    // Upsert: replace the slots for that date, but don't touch already-booked slots
    let record = await Availability.findOne({ providerId: req.user.id, date });

    if (!record) {
      record = await Availability.create({ providerId: req.user.id, date, slots });
    } else {
      // Only replace slots that are NOT booked
      const bookedSlots = record.slots.filter(s => s.isBooked);
      record.slots = [
        ...bookedSlots,
        ...slots.map(s => ({ startTime: s.startTime, endTime: s.endTime, isBooked: false })),
      ];
      await record.save();
    }

    res.status(200).json({ success: true, data: record });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Provider deletes a single free slot
// @route   DELETE /api/v1/availability/:date/:slotId
// @access  Private (Provider)
exports.deleteSlot = async (req, res) => {
  try {
    const { date, slotId } = req.params;
    const record = await Availability.findOne({ providerId: req.user.id, date });

    if (!record) return res.status(404).json({ success: false, error: 'No availability record for this date' });

    const slot = record.slots.id(slotId);
    if (!slot) return res.status(404).json({ success: false, error: 'Slot not found' });
    if (slot.isBooked) return res.status(400).json({ success: false, error: 'Cannot delete an already-booked slot' });

    record.slots.pull(slotId);
    await record.save();

    res.status(200).json({ success: true, message: 'Slot deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get all availability for a provider (for calendar view)
// @route   GET /api/v1/availability/:providerId/range?from=YYYY-MM-DD&to=YYYY-MM-DD
// @access  Public
exports.getAvailabilityRange = async (req, res) => {
  try {
    const { providerId } = req.params;
    const { from, to } = req.query;

    const filter = { providerId };
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = from;
      if (to) filter.date.$lte = to;
    }

    const records = await Availability.find(filter).lean();
    res.status(200).json({ success: true, data: records });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
