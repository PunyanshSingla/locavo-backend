const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

dotenv.config({ path: './.env' });

const seedLocations = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected...');

        const providers = await User.find({ role: 'provider' });

        if (providers.length === 0) {
            console.log('No providers found. Please create some providers first.');
            process.exit();
        }

        // Example: Seed around Delhi coordinates [77.2090, 28.6139]
        // or just use whatever coordinates if we want them to show up globally for testing
        // We'll give each provider a random location around Delhi for demonstration
        const baseLng = 73.2066737856528;
        const baseLat = 29.19219890444764;

        const updates = providers.map((provider, index) => {
            // Randomize within ~10km
            const lng = baseLng + (Math.random() - 0.5) * 0.1;
            const lat = baseLat + (Math.random() - 0.5) * 0.1;

            return User.findByIdAndUpdate(provider._id, {
                location: {
                    type: 'Point',
                    coordinates: [lng, lat],
                    formattedAddress: 'Seeded Location, India'
                },
                'providerDetails.isApproved': true // Ensure they are approved to show up
            });
        });

        await Promise.all(updates);
        console.log(`Updated ${providers.length} providers with sample locations near Delhi.`);

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seedLocations();
