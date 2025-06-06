#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import { DatabaseService } from '../src/services/DatabaseService';
import { ProfileManager } from '../src/core/ProfileManager';
import { BrowserPool } from '../src/core/BrowserPool';
import { createLogger } from '../src/utils/logger';

dotenv.config();

const logger = createLogger('GenerateProfiles');

interface GenerateOptions {
  count: number;
  region?: string;
  city?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet';
  warmup?: boolean;
  distribution?: {
    desktop: number;
    mobile: number;
    tablet: number;
  };
}

async function generateProfiles(options: GenerateOptions) {
  const db = new DatabaseService();
  const browserPool = new BrowserPool({ maxBrowsers: 1, headless: true });
  const profileManager = new ProfileManager(db, browserPool);

  try {
    logger.info('Connecting to database...');
    await db.connect();
    await profileManager.initialize();

    logger.info(`Generating ${options.count} profiles...`);

    const profiles = [];
    const distribution = options.distribution || {
      desktop: 0.7,
      mobile: 0.25,
      tablet: 0.05
    };

    // Calculate device type counts
    const deviceCounts = {
      desktop: Math.floor(options.count * distribution.desktop),
      mobile: Math.floor(options.count * distribution.mobile),
      tablet: Math.floor(options.count * distribution.tablet)
    };

    // Adjust for rounding
    const total = Object.values(deviceCounts).reduce((sum, count) => sum + count, 0);
    if (total < options.count) {
      deviceCounts.desktop += options.count - total;
    }

    // Generate profiles by device type
    let created = 0;
    
    for (const [deviceType, count] of Object.entries(deviceCounts)) {
      for (let i = 0; i < count; i++) {
        try {
          const profile = await profileManager.createProfile({
            region: options.region,
            city: options.city,
            deviceType: deviceType as any,
            persona: generatePersonaOptions()
          });

          profiles.push(profile);
          created++;

          if (created % 10 === 0) {
            logger.info(`Created ${created}/${options.count} profiles`);
          }

          // Add small delay to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          logger.error(`Failed to create profile: ${error.message}`);
        }
      }
    }

    logger.info(`Successfully created ${profiles.length} profiles`);

    // Start warmup if requested
    if (options.warmup) {
      logger.info('Starting warmup process...');
      
      for (const profile of profiles) {
        try {
          await profileManager.warmupProfile(profile.id);
        } catch (error) {
          logger.error(`Failed to warmup profile ${profile.id}: ${error.message}`);
        }
      }
      
      logger.info('Warmup tasks created for all profiles');
    }

    // Generate summary report
    const summary = {
      total: profiles.length,
      byDevice: {
        desktop: profiles.filter(p => p.identity.device.type === 'desktop').length,
        mobile: profiles.filter(p => p.identity.device.type === 'mobile').length,
        tablet: profiles.filter(p => p.identity.device.type === 'tablet').length
      },
      byRegion: profiles.reduce((acc, p) => {
        const region = p.identity.location.region;
        acc[region] = (acc[region] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      warmup: options.warmup ? 'Started' : 'Not started'
    };

    console.log('\n📊 Profile Generation Summary:');
    console.log('================================');
    console.log(`Total profiles created: ${summary.total}`);
    console.log('\nBy device type:');
    Object.entries(summary.byDevice).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
    console.log('\nBy region:');
    Object.entries(summary.byRegion).forEach(([region, count]) => {
      console.log(`  ${region}: ${count}`);
    });
    console.log(`\nWarmup: ${summary.warmup}`);
    console.log('================================\n');

  } catch (error) {
    logger.error('Failed to generate profiles:', error);
    process.exit(1);
  } finally {
    await db.disconnect();
    await browserPool.shutdown();
  }
}

function generatePersonaOptions() {
  const interests = [
    ['technology', 'gadgets', 'software'],
    ['shopping', 'fashion', 'deals'],
    ['travel', 'hotels', 'flights'],
    ['food', 'restaurants', 'cooking'],
    ['sports', 'fitness', 'health'],
    ['entertainment', 'movies', 'music'],
    ['business', 'finance', 'investing'],
    ['education', 'courses', 'learning']
  ];

  const selectedInterests = interests[Math.floor(Math.random() * interests.length)];
  
  return {
    age: Math.floor(Math.random() * 40) + 20, // 20-60
    gender: Math.random() > 0.5 ? 'male' : 'female',
    interests: selectedInterests
  };
}

// Parse command line arguments
function parseArgs(): GenerateOptions {
  const args = process.argv.slice(2);
  const options: GenerateOptions = {
    count: 10,
    warmup: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--count':
      case '-c':
        options.count = parseInt(args[++i]) || 10;
        break;
      case '--region':
      case '-r':
        options.region = args[++i];
        break;
      case '--city':
        options.city = args[++i];
        break;
      case '--device':
      case '-d':
        options.deviceType = args[++i] as any;
        break;
      case '--warmup':
      case '-w':
        options.warmup = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Profile Generation Script

Usage: npm run generate-profiles -- [options]

Options:
  -c, --count <n>      Number of profiles to create (default: 10)
  -r, --region <name>  Geographic region (default: Moscow)
  --city <name>        City name
  -d, --device <type>  Device type: desktop, mobile, tablet (default: mixed)
  -w, --warmup         Start warmup process after creation
  -h, --help           Show this help message

Examples:
  npm run generate-profiles -- --count 50 --region Moscow --warmup
  npm run generate-profiles -- -c 20 -d mobile
  npm run generate-profiles -- --count 100 --city "Saint Petersburg"
        `);
        process.exit(0);
    }
  }

  return options;
}

// Main execution
if (require.main === module) {
  const options = parseArgs();
  generateProfiles(options).catch(console.error);
}