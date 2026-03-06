const Quote = require('../models/Quote');

// @desc    Customer requests a quote from provider
// @route   POST /api/v1/quotes
// @access  Private
exports.requestQuote = async (req, res) => {
  try {
    const { providerId, serviceId, message, budget, images } = req.body;

    if (!providerId || !message) {
      return res.status(400).json({ success: false, error: 'providerId and message are required' });
    }

    const quote = await Quote.create({
      customerId: req.user.id,
      providerId,
      serviceId: serviceId || undefined,
      message,
      budget: budget || undefined,
      images: images || [],
    });

    res.status(201).json({ success: true, data: quote });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Get quotes for the logged-in user (customer sees theirs, provider sees theirs)
// @route   GET /api/v1/quotes
// @access  Private
exports.getQuotes = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    let filter;
    if (req.user.role === 'provider') {
      filter = { providerId: req.user.id };
    } else {
      filter = { customerId: req.user.id };
    }

    const [quotes, total] = await Promise.all([
      Quote.find(filter)
        .populate('customerId', 'name profilePicture')
        .populate('providerId', 'name profilePicture providerDetails.rating')
        .populate('serviceId', 'title basePrice')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Quote.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: quotes.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: quotes,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Provider replies to a quote
// @route   PUT /api/v1/quotes/:id/reply
// @access  Private (Provider)
exports.replyQuote = async (req, res) => {
  try {
    const { reply } = req.body;
    if (!reply) {
      return res.status(400).json({ success: false, error: 'Reply message is required' });
    }

    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, error: 'Quote not found' });
    }

    if (quote.providerId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    quote.reply = reply;
    quote.status = 'replied';
    await quote.save();

    res.status(200).json({ success: true, data: quote });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};
