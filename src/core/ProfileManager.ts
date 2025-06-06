import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { faker } from '@faker-js/faker';
import { DatabaseService } from '../services/DatabaseService';
import { BrowserPool } from './BrowserPool';
import { createLogger, Logger } from '../utils/logger';
import { Profile, ProfileStatus, ProfileHealth, BrowserFingerprint } from '../types';
import { generateFingerprint } from '../utils/fingerprint';
import { config } from '../config';

export class ProfileManager extends EventEmitter {
  private logger: Logger;
  private profiles: Map<string, Profile> = new Map();
  private healthCheckInterval?: NodeJS.Timer;

  constructor(
    private db: DatabaseService,
    private browserPool: BrowserPool
  ) {
    super();
    this.logger = createLogger('ProfileManager');
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing ProfileManager...');

    // Load existing profiles
    await this.loadProfiles();

    // Start health monitoring
    this.startHealthMonitoring();

    this.logger.info(`ProfileManager initialized with ${this.profiles.size} profiles`);
  }

  async createProfile(options: {
    region?: string;
    city?: string;
    deviceType?: 'desktop' | 'mobile' | 'tablet';
    persona?: {
      age?: number;
      gender?: 'male' | 'female';
      interests?: string[];
    };
  } = {}): Promise<Profile> {
    const profileId = `profile-${uuidv4()}`;
    
    // Generate location
    const location = this.generateLocation(options.region, options.city);
    
    // Generate fingerprint
    const fingerprint = await generateFingerprint({
      deviceType: options.deviceType || 'desktop',
      location
    });

    // Generate persona
    const persona = this.generatePersona(options.persona);

    // Create profile
    const profile: Profile = {
      id: profileId,
      status: ProfileStatus.NEW,
      created: new Date(),
      lastActive: new Date(),
      
      identity: {
        persona,
        location,
        device: {
          type: options.deviceType || 'desktop',
          manufacturer: this.getDeviceManufacturer(fingerprint.userAgent),
          model: this.getDeviceModel(fingerprint.userAgent),
          os: this.getOS(fingerprint.platform),
          osVersion: this.getOSVersion(fingerprint.userAgent)
        }
      },
      
      fingerprint,
      
      behavior: this.generateBehaviorPattern(persona, options.deviceType),
      
      stats: {
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        totalSearches: 0,
        totalClicks: 0,
        totalTimeSpent: 0,
        captchasSolved: 0,
        captchasFailed: 0,
        lastTaskDate: null
      },
      
      health: {
        score: 100,
        factors: {
          successRate: 1.0,
          captchaRate: 0,
          averageSessionDuration: 0,
          daysSinceLastActivity: 0,
          taskCompletionRate: 1.0
        },
        lastCheck: new Date()
      },
      
      cookies: [],
      history: [],
      credentials: []
    };

    // Save to database
    await this.db.profiles.create(profile);
    
    // Cache in memory
    this.profiles.set(profileId, profile);
    
    // Emit event
    this.emit('profile:created', profile);
    
    this.logger.info(`Profile created: ${profileId}`, {
      region: location.region,
      device: options.deviceType
    });

    return profile;
  }

  async getProfile(profileId: string): Promise<Profile | null> {
    // Check cache first
    if (this.profiles.has(profileId)) {
      return this.profiles.get(profileId)!;
    }

    // Load from database
    const profile = await this.db.profiles.findById(profileId);
    if (profile) {
      this.profiles.set(profileId, profile);
    }

    return profile;
  }

  async updateProfile(profileId: string, updates: Partial<Profile>): Promise<Profile> {
    const profile = await this.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    // Apply updates
    const updatedProfile = { ...profile, ...updates };
    
    // Save to database
    await this.db.profiles.update(profileId, updatedProfile);
    
    // Update cache
    this.profiles.set(profileId, updatedProfile);
    
    // Emit event
    this.emit('profile:updated', updatedProfile);

    return updatedProfile;
  }

  async getHealthyProfiles(
    minHealth: number = 60,
    limit?: number
  ): Promise<Profile[]> {
    const profiles = Array.from(this.profiles.values())
      .filter(p => 
        p.status === ProfileStatus.ACTIVE && 
        p.health.score >= minHealth
      )
      .sort((a, b) => b.health.score - a.health.score);

    return limit ? profiles.slice(0, limit) : profiles;
  }

  async warmupProfile(profileId: string): Promise<void> {
    const profile = await this.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    // Update status
    await this.updateProfile(profileId, {
      status: ProfileStatus.WARMING
    });

    // Create warmup tasks
    const warmupDays = config.PROFILE_WARMUP_DAYS;
    const tasks = this.generateWarmupTasks(profileId, warmupDays);

    // Schedule tasks
    for (const task of tasks) {
      await this.db.tasks.create(task);
    }

    this.logger.info(`Warmup started for profile: ${profileId}`, {
      days: warmupDays,
      tasks: tasks.length
    });
  }

  async suspendProfile(profileId: string, reason: string): Promise<void> {
    await this.updateProfile(profileId, {
      status: ProfileStatus.SUSPENDED,
      suspendedAt: new Date(),
      suspendedReason: reason
    });

    this.logger.warn(`Profile suspended: ${profileId}`, { reason });
    this.emit('profile:suspended', { profileId, reason });
  }

  async updateProfileHealth(profileId: string): Promise<Profile> {
    const profile = await this.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    // Calculate health factors
    const health = this.calculateHealth(profile);
    
    // Update profile
    const updatedProfile = await this.updateProfile(profileId, {
      health: {
        ...health,
        lastCheck: new Date()
      }
    });

    // Check if profile should be suspended
    if (health.score < 30) {
      await this.suspendProfile(profileId, 'Low health score');
    }

    return updatedProfile;
  }

  private calculateHealth(profile: Profile): ProfileHealth {
    const stats = profile.stats;
    
    // Success rate (40% weight)
    const successRate = stats.totalTasks > 0
      ? stats.successfulTasks / stats.totalTasks
      : 1.0;
    const successScore = successRate * 40;

    // Captcha rate (20% weight)
    const captchaRate = stats.totalTasks > 0
      ? stats.captchasSolved / stats.totalTasks
      : 0;
    const captchaScore = (1 - Math.min(captchaRate * 2, 1)) * 20;

    // Session duration (20% weight)
    const avgDuration = stats.totalTasks > 0
      ? stats.totalTimeSpent / stats.totalTasks
      : 0;
    const durationScore = Math.min(avgDuration / 180000, 1) * 20; // 3 min optimal

    // Activity recency (10% weight)
    const daysSinceActive = stats.lastTaskDate
      ? (Date.now() - stats.lastTaskDate.getTime()) / (1000 * 60 * 60 * 24)
      : 0;
    const recencyScore = Math.max(0, 1 - (daysSinceActive / 7)) * 10;

    // Task completion (10% weight)
    const completionRate = stats.totalTasks > 0
      ? (stats.successfulTasks + stats.failedTasks) / stats.totalTasks
      : 1.0;
    const completionScore = completionRate * 10;

    // Calculate total score
    const totalScore = Math.round(
      successScore + captchaScore + durationScore + recencyScore + completionScore
    );

    return {
      score: Math.max(0, Math.min(100, totalScore)),
      factors: {
        successRate,
        captchaRate,
        averageSessionDuration: avgDuration,
        daysSinceLastActivity: Math.round(daysSinceActive),
        taskCompletionRate: completionRate
      },
      lastCheck: new Date()
    };
  }

  private generateLocation(region?: string, city?: string) {
    // Default to Moscow if not specified
    const locations = {
      'Moscow': {
        country: 'RU',
        region: 'Moscow',
        city: 'Moscow',
        district: faker.helpers.arrayElement(['Центральный', 'Северный', 'Южный', 'Восточный', 'Западный']),
        coordinates: {
          latitude: 55.7558 + (Math.random() - 0.5) * 0.2,
          longitude: 37.6173 + (Math.random() - 0.5) * 0.3,
          accuracy: faker.number.int({ min: 10, max: 100 })
        },
        timezone: 'Europe/Moscow',
        languages: ['ru-RU', 'ru', 'en-US', 'en']
      },
      'Saint Petersburg': {
        country: 'RU',
        region: 'Saint Petersburg',
        city: 'Saint Petersburg',
        district: faker.helpers.arrayElement(['Адмиралтейский', 'Василеостровский', 'Выборгский', 'Калининский']),
        coordinates: {
          latitude: 59.9311 + (Math.random() - 0.5) * 0.1,
          longitude: 30.3609 + (Math.random() - 0.5) * 0.2,
          accuracy: faker.number.int({ min: 10, max: 100 })
        },
        timezone: 'Europe/Moscow',
        languages: ['ru-RU', 'ru', 'en-US', 'en']
      }
    };

    const selectedCity = city || region || 'Moscow';
    return locations[selectedCity] || locations['Moscow'];
  }

  private generatePersona(options?: any) {
    const age = options?.age || faker.number.int({ min: 18, max: 65 });
    const gender = options?.gender || faker.helpers.arrayElement(['male', 'female']);
    
    const interestCategories = {
      young: ['gaming', 'social media', 'technology', 'music', 'fashion', 'sports'],
      middle: ['news', 'shopping', 'travel', 'cooking', 'finance', 'health'],
      senior: ['news', 'health', 'gardening', 'cooking', 'travel', 'finance']
    };

    let category = 'middle';
    if (age < 25) category = 'young';
    else if (age > 50) category = 'senior';

    const interests = options?.interests || faker.helpers.arrayElements(
      interestCategories[category],
      faker.number.int({ min: 3, max: 5 })
    );

    const occupations = ['student', 'employee', 'manager', 'freelancer', 'business owner', 'retired'];
    const incomes = ['low', 'medium', 'high'];

    return {
      age,
      gender,
      interests,
      occupation: faker.helpers.arrayElement(occupations),
      income: faker.helpers.arrayElement(incomes)
    };
  }

  private generateBehaviorPattern(persona: any, deviceType?: string) {
    const isMobile = deviceType === 'mobile';
    const isYoung = persona.age < 30;
    const isSenior = persona.age > 50;

    return {
      timing: {
        activeHours: isYoung 
          ? [{ start: 10, end: 14 }, { start: 19, end: 23 }]
          : [{ start: 8, end: 12 }, { start: 18, end: 22 }],
        activeDays: [1, 2, 3, 4, 5, 6, 0], // All days
        sessionDuration: {
          min: isMobile ? 5 : 10,
          max: isMobile ? 30 : 60,
          avg: isMobile ? 15 : 30
        },
        betweenSessions: {
          min: 1800000, // 30 min
          max: 14400000 // 4 hours
        }
      },
      
      interaction: {
        mouseSpeed: {
          min: isSenior ? 0.5 : 0.8,
          max: isSenior ? 1.0 : 1.5,
          curve: 'ease-in-out'
        },
        scrollSpeed: {
          min: isMobile ? 100 : 200,
          max: isMobile ? 300 : 500
        },
        typingSpeed: {
          min: isSenior ? 20 : 30,
          max: isSenior ? 40 : 60,
          errors: isYoung ? 0.02 : 0.01
        },
        clickAccuracy: isSenior ? 0.9 : 0.95,
        hoverTime: {
          min: 100,
          max: 500
        }
      },
      
      search: {
        engines: [
          { name: 'yandex', weight: 0.6 },
          { name: 'google', weight: 0.4 }
        ],
        queryTypes: [
          { type: 'navigational', weight: 0.2 },
          { type: 'informational', weight: 0.5 },
          { type: 'transactional', weight: 0.3 }
        ],
        refinements: isYoung ? 0.3 : 0.1,
        resultsViewed: {
          min: 3,
          max: 10
        },
        pagesVisited: {
          min: 1,
          max: 5
        }
      },
      
      browsing: {
        readingSpeed: 200 + faker.number.int({ min: -50, max: 100 }),
        attentionSpan: {
          min: isMobile ? 30000 : 60000,
          max: isMobile ? 180000 : 600000
        },
        multitabUsage: !isMobile && isYoung,
        bookmarkUsage: !isMobile && Math.random() > 0.5,
        historyUsage: Math.random() > 0.3
      }
    };
  }

  private generateWarmupTasks(profileId: string, days: number) {
    const tasks = [];
    const baseActivities = ['news', 'weather', 'maps'];
    const advancedActivities = ['shopping', 'video', 'social', 'banking'];

    for (let day = 1; day <= days; day++) {
      const intensity = Math.min(day / days, 1);
      const taskCount = Math.floor(2 + intensity * 8);
      
      // Mix of activities based on warmup progress
      const activities = day < 4 
        ? baseActivities
        : [...baseActivities, ...advancedActivities.slice(0, Math.floor(intensity * advancedActivities.length))];

      for (let i = 0; i < taskCount; i++) {
        const scheduledTime = new Date();
        scheduledTime.setDate(scheduledTime.getDate() + day - 1);
        scheduledTime.setHours(
          faker.number.int({ min: 8, max: 22 }),
          faker.number.int({ min: 0, max: 59 })
        );

        tasks.push({
          id: `task-${uuidv4()}`,
          type: 'warmup',
          profileId,
          priority: 5,
          status: 'pending',
          config: {
            day,
            activity: faker.helpers.arrayElement(activities),
            duration: faker.number.int({ min: 60000, max: 300000 })
          },
          schedule: {
            type: 'scheduled',
            scheduledFor: scheduledTime
          },
          createdAt: new Date()
        });
      }
    }

    return tasks;
  }

  private startHealthMonitoring() {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const profiles = await this.db.profiles.find({
          status: { $in: [ProfileStatus.ACTIVE, ProfileStatus.WARMING] }
        });

        for (const profile of profiles) {
          await this.updateProfileHealth(profile.id);
        }
      } catch (error) {
        this.logger.error('Health monitoring error', error);
      }
    }, config.PROFILE_HEALTH_CHECK_INTERVAL);
  }

  private loadProfiles = async () => {
    const profiles = await this.db.profiles.find({});
    for (const profile of profiles) {
      this.profiles.set(profile.id, profile);
    }
  };

  private getDeviceManufacturer(userAgent: string): string {
    if (userAgent.includes('Windows')) return 'Microsoft';
    if (userAgent.includes('Mac')) return 'Apple';
    if (userAgent.includes('Linux')) return 'Generic';
    return 'Unknown';
  }

  private getDeviceModel(userAgent: string): string {
    // Simplified - in production would parse more thoroughly
    if (userAgent.includes('Windows')) return 'PC';
    if (userAgent.includes('Mac')) return 'Mac';
    return 'Generic';
  }

  private getOS(platform: string): string {
    const osMap = {
      'Win32': 'Windows',
      'MacIntel': 'macOS',
      'Linux x86_64': 'Linux'
    };
    return osMap[platform] || 'Unknown';
  }

  private getOSVersion(userAgent: string): string {
    // Simplified - in production would parse more thoroughly
    const match = userAgent.match(/Windows NT (\d+\.\d+)|Mac OS X (\d+_\d+)/);
    return match ? match[1] || match[2] : 'Unknown';
  }

  async shutdown() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.removeAllListeners();
  }
}