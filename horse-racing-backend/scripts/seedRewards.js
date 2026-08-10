require('dotenv').config();
const { connectDatabase } = require('../config/database');
const { RewardItem } = require('../models');

async function seedRewards() {
  try {
    await connectDatabase();
    console.log('Connected to MongoDB.');

    // Clear existing rewards
    await RewardItem.deleteMany({});
    console.log('Cleared existing reward items.');

    const sampleRewards = [
      {
        name: 'VIP Race Ticket',
        description: 'Get exclusive access to the VIP lounge and best view seats.',
        token_price: 100,
        stock: 5,
        is_active: true,
        image_url: 'https://images.unsplash.com/photo-1542157585-ef20bfcce579?q=80&w=2000&auto=format&fit=crop'
      },
      {
        name: 'Standard Entry Pass',
        description: 'General admission ticket for a single race day.',
        token_price: 20,
        stock: 50,
        is_active: true,
        image_url: 'https://images.unsplash.com/photo-1522069818816-5b6510bb076e?q=80&w=2000&auto=format&fit=crop'
      },
      {
        name: 'Horse Owner Cap',
        description: 'Limited edition baseball cap with embroidery logo.',
        token_price: 50,
        stock: 10,
        is_active: true,
        image_url: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?q=80&w=2000&auto=format&fit=crop'
      },
      {
        name: 'Golden Jockey Trophy Replica',
        description: 'Miniature golden replica of the championship trophy.',
        token_price: 500,
        stock: 2,
        is_active: true,
        image_url: 'https://images.unsplash.com/photo-1574015974293-817f0ebebb74?q=80&w=2000&auto=format&fit=crop'
      },
      {
        name: 'Spectator Snack Bundle',
        description: 'Voucher for a combo of popcorn and soft drink at the stands.',
        token_price: 10,
        stock: 100,
        is_active: true,
        image_url: 'https://images.unsplash.com/photo-1585647347384-2593bc35786b?q=80&w=2000&auto=format&fit=crop'
      }
    ];

    const docs = await RewardItem.insertMany(sampleRewards);
    console.log(`Successfully seeded ${docs.length} reward items:`);
    docs.forEach(d => {
      console.log(`- [${d._id}] ${d.name} (${d.token_price} Tokens, Stock: ${d.stock})`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error seeding reward items:', error);
    process.exit(1);
  }
}

seedRewards();
