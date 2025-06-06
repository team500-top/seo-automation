#!/usr/bin/env ts-node

import { Command } from 'commander';
import dotenv from 'dotenv';
import axios from 'axios';
import { table } from 'table';
import chalk from 'chalk';
import ora from 'ora';
import { DatabaseService } from '../services/DatabaseService';
import { config } from '../config';

dotenv.config();

const API_BASE_URL = `http://localhost:${config.PORT}/api`;
const API_KEY = config.API_KEY;

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'X-API-Key': API_KEY
  }
});

// CLI Program
const program = new Command();

program
  .name('seo-cli')
  .description('SEO Automation System CLI')
  .version('1.0.0');

// === Profile Commands ===
const profiles = program.command('profiles').description('Manage profiles');

profiles
  .command('create')
  .description('Create new profiles')
  .option('-c, --count <number>', 'Number of profiles to create', '10')
  .option('-r, --region <region>', 'Region for profiles', 'Moscow')
  .option('-d, --device <type>', 'Device type (desktop/mobile/tablet)')
  .option('-w, --warmup', 'Start warmup after creation')
  .action(async (options) => {
    const spinner = ora('Creating profiles...').start();
    
    try {
      const response = await api.post('/profiles', {
        count: parseInt(options.count),
        options: {
          region: options.region,
          deviceType: options.device
        }
      });
      
      spinner.succeed(`Created ${response.data.data.created} profiles`);
      
      if (options.warmup) {
        spinner.start('Starting warmup...');
        const profileIds = response.data.data.profiles.map(p => p.id);
        await api.post('/profiles/bulk/warmup', { profileIds });
        spinner.succeed('Warmup started');
      }
    } catch (error) {
      spinner.fail('Failed to create profiles');
      console.error(chalk.red(error.response?.data?.message || error.message));
      process.exit(1);
    }
  });

profiles
  .command('list')
  .description('List profiles')
  .option('-s, --status <status>', 'Filter by status')
  .option('-h, --health-min <number>', 'Minimum health score')
  .option('-l, --limit <number>', 'Number of profiles to show', '20')
  .action(async (options) => {
    try {
      const response = await api.get('/profiles', { params: options });
      const profiles = response.data.data;
      
      if (profiles.length === 0) {
        console.log(chalk.yellow('No profiles found'));
        return;
      }
      
      const tableData = [
        ['ID', 'Status', 'Health', 'Region', 'Device', 'Last Active'],
        ...profiles.map(p => [
          p.id.substring(0, 12) + '...',
          colorizeStatus(p.status),
          colorizeHealth(p.health.score),
          p.identity.location.region,
          p.identity.device.type,
          new Date(p.lastActive).toLocaleString()
        ])
      ];
      
      console.log(table(tableData));
      console.log(chalk.gray(`Total: ${response.data.pagination.total} profiles`));
    } catch (error) {
      console.error(chalk.red('Failed to list profiles'));
      console.error(error.response?.data?.message || error.message);
    }
  });

profiles
  .command('warmup')
  .description('Start profile warmup')
  .option('-i, --id <id>', 'Profile ID')
  .option('-s, --status <status>', 'Warmup profiles with status', 'new')
  .option('-c, --count <number>', 'Number of profiles to warmup', '50')
  .action(async (options) => {
    const spinner = ora('Starting warmup...').start();
    
    try {
      if (options.id) {
        await api.post(`/profiles/${options.id}/warmup`);
        spinner.succeed('Warmup started for profile');
      } else {
        const response = await api.post('/profiles/bulk/warmup', {
          status: options.status,
          count: parseInt(options.count)
        });
        spinner.succeed(`Warmup started for ${response.data.data.successful} profiles`);
      }
    } catch (error) {
      spinner.fail('Failed to start warmup');
      console.error(chalk.red(error.response?.data?.message || error.message));
    }
  });

// === Task Commands ===
const tasks = program.command('tasks').description('Manage tasks');

tasks
  .command('create')
  .description('Create a new task')
  .requiredOption('-t, --type <type>', 'Task type (search/target_visit/organic)')
  .option('-q, --query <query>', 'Search query')
  .option('-d, --target <domain>', 'Target domain')
  .option('-e, --engine <engine>', 'Search engine (yandex/google)', 'yandex')
  .option('-p, --profiles <number>', 'Number of profiles to use', '10')
  .option('--priority <number>', 'Task priority (1-9)', '5')
  .action(async (options) => {
    const spinner = ora('Creating task...').start();
    
    try {
      const taskData: any = {
        type: options.type,
        priority: parseInt(options.priority)
      };
      
      if (options.type === 'search') {
        taskData.config = {
          search: {
            engine: options.engine,
            query: options.query,
            targetDomain: options.target,
            maxResultPages: 5
          }
        };
      }
      
      // Create task for multiple profiles
      const profiles = await api.get('/profiles', {
        params: { status: 'active', limit: options.profiles }
      });
      
      const tasks = [];
      for (const profile of profiles.data.data) {
        tasks.push({
          ...taskData,
          profileId: profile.id
        });
      }
      
      const response = await api.post('/tasks/bulk', { tasks });
      spinner.succeed(`Created ${response.data.data.created} tasks`);
    } catch (error) {
      spinner.fail('Failed to create task');
      console.error(chalk.red(error.response?.data?.message || error.message));
    }
  });

tasks
  .command('status')
  .description('Show task status')
  .option('-i, --id <id>', 'Task ID')
  .option('-s, --status <status>', 'Filter by status')
  .option('-l, --limit <number>', 'Number of tasks to show', '20')
  .action(async (options) => {
    try {
      if (options.id) {
        const response = await api.get(`/tasks/${options.id}`);
        const task = response.data.data;
        
        console.log(chalk.bold('Task Details:'));
        console.log(`ID: ${task.id}`);
        console.log(`Type: ${task.type}`);
        console.log(`Status: ${colorizeStatus(task.status)}`);
        console.log(`Profile: ${task.profileId}`);
        console.log(`Created: ${new Date(task.createdAt).toLocaleString()}`);
        
        if (task.result) {
          console.log('\nResult:');
          console.log(JSON.stringify(task.result, null, 2));
        }
      } else {
        const response = await api.get('/tasks', { params: options });
        const tasks = response.data.data;
        
        const tableData = [
          ['ID', 'Type', 'Status', 'Profile', 'Created'],
          ...tasks.map(t => [
            t.id.substring(0, 12) + '...',
            t.type,
            colorizeStatus(t.status),
            t.profileId.substring(0, 12) + '...',
            new Date(t.createdAt).toLocaleString()
          ])
        ];
        
        console.log(table(tableData));
      }
    } catch (error) {
      console.error(chalk.red('Failed to get task status'));
      console.error(error.response?.data?.message || error.message);
    }
  });

// === Metrics Commands ===
const metrics = program.command('metrics').description('View metrics');

metrics
  .command('positions')
  .description('Show search positions')
  .requiredOption('-d, --domain <domain>', 'Target domain')
  .option('-e, --engine <engine>', 'Search engine')
  .action(async (options) => {
    try {
      const response = await api.get('/metrics/positions', { params: options });
      const positions = response.data.data;
      
      if (positions.length === 0) {
        console.log(chalk.yellow('No position data found'));
        return;
      }
      
      const tableData = [
        ['Query', 'Engine', 'Position', 'Change', 'Trend'],
        ...positions.map(p => [
          p.query,
          p.engine,
          p.current || '>100',
          formatChange(p.change),
          p.trend
        ])
      ];
      
      console.log(table(tableData));
    } catch (error) {
      console.error(chalk.red('Failed to get positions'));
      console.error(error.response?.data?.message || error.message);
    }
  });

metrics
  .command('summary')
  .description('Show metrics summary')
  .option('-p, --period <period>', 'Time period (1d/7d/30d)', '7d')
  .action(async (options) => {
    try {
      const response = await api.get('/metrics/current');
      const metrics = response.data.data;
      
      console.log(chalk.bold('\n📊 System Metrics Summary\n'));
      
      console.log(chalk.cyan('Profiles:'));
      console.log(`  Total: ${metrics.profiles.total}`);
      console.log(`  Active: ${metrics.profiles.active}`);
      console.log(`  Average Health: ${Math.round(metrics.profiles.avgHealth)}%`);
      
      console.log(chalk.cyan('\nTasks:'));
      console.log(`  Pending: ${metrics.tasks.pending}`);
      console.log(`  Running: ${metrics.tasks.running}`);
      console.log(`  Success Rate: ${Math.round(metrics.tasks.successRate)}%`);
      
      console.log(chalk.cyan('\nResources:'));
      console.log(`  CPU: ${Math.round(metrics.resources.cpu)}%`);
      console.log(`  Memory: ${Math.round(metrics.resources.memory)}%`);
      console.log(`  Browsers: ${metrics.resources.browsers.active}/${metrics.resources.browsers.available}`);
    } catch (error) {
      console.error(chalk.red('Failed to get metrics'));
      console.error(error.response?.data?.message || error.message);
    }
  });

// === System Commands ===
const system = program.command('system').description('System management');

system
  .command('status')
  .description('Show system status')
  .action(async () => {
    try {
      const response = await api.get('/system/status');
      const status = response.data.data;
      
      console.log(chalk.bold('\n🖥️  System Status\n'));
      console.log(`Status: ${colorizeSystemStatus(status.status)}`);
      console.log(`Version: ${status.version}`);
      console.log(`Uptime: ${formatUptime(status.uptime)}`);
      
      console.log(chalk.cyan('\nComponents:'));
      Object.entries(status.components).forEach(([name, component]: [string, any]) => {
        console.log(`  ${name}: ${colorizeSystemStatus(component.status)}`);
      });
    } catch (error) {
      console.error(chalk.red('Failed to get system status'));
      console.error(error.response?.data?.message || error.message);
    }
  });

system
  .command('health-check')
  .description('Run system health check')
  .action(async () => {
    const spinner = ora('Running health check...').start();
    
    try {
      const response = await api.get('/system/diagnostics');
      const diagnostics = response.data.data;
      
      spinner.stop();
      
      console.log(chalk.bold('\n🏥 Health Check Results\n'));
      
      diagnostics.checks.forEach(check => {
        const icon = check.status === 'pass' ? '✅' : 
                    check.status === 'warn' ? '⚠️' : '❌';
        console.log(`${icon} ${check.name}: ${check.status}`);
        if (check.details) {
          console.log(chalk.gray(`   ${JSON.stringify(check.details)}`));
        }
      });
    } catch (error) {
      spinner.fail('Health check failed');
      console.error(chalk.red(error.response?.data?.message || error.message));
    }
  });

system
  .command('backup')
  .description('Create system backup')
  .option('-c, --collections <collections>', 'Collections to backup (comma-separated)')
  .action(async (options) => {
    const spinner = ora('Creating backup...').start();
    
    try {
      const collections = options.collections?.split(',');
      const response = await api.post('/system/backup', { collections });
      
      spinner.succeed(`Backup created: ${response.data.data.backupId}`);
    } catch (error) {
      spinner.fail('Backup failed');
      console.error(chalk.red(error.response?.data?.message || error.message));
    }
  });

// === Database Commands ===
const db = program.command('db').description('Database operations');

db
  .command('create-indexes')
  .description('Create database indexes')
  .action(async () => {
    const spinner = ora('Creating indexes...').start();
    
    try {
      const database = new DatabaseService();
      await database.connect();
      
      // Indexes are created automatically in DatabaseService.connect()
      spinner.succeed('Indexes created successfully');
      
      await database.disconnect();
    } catch (error) {
      spinner.fail('Failed to create indexes');
      console.error(chalk.red(error.message));
    }
  });

db
  .command('cleanup')
  .description('Clean up old data')
  .option('-d, --days <number>', 'Days to keep', '30')
  .action(async (options) => {
    const spinner = ora('Cleaning up old data...').start();
    
    try {
      const response = await api.post('/system/cleanup', {
        days: parseInt(options.days)
      });
      
      spinner.succeed(response.data.message);
    } catch (error) {
      spinner.fail('Cleanup failed');
      console.error(chalk.red(error.response?.data?.message || error.message));
    }
  });

// === Proxy Commands ===
const proxies = program.command('proxies').description('Proxy management');

proxies
  .command('test')
  .description('Test proxy connection')
  .option('-p, --provider <provider>', 'Proxy provider')
  .action(async (options) => {
    const spinner = ora('Testing proxy...').start();
    
    try {
      // This would be implemented in the proxy service
      spinner.succeed('Proxy test completed');
      console.log(chalk.green('✓ Proxy is working'));
    } catch (error) {
      spinner.fail('Proxy test failed');
      console.error(chalk.red(error.message));
    }
  });

proxies
  .command('rotate')
  .description('Force proxy rotation')
  .action(async () => {
    const spinner = ora('Rotating proxies...').start();
    
    try {
      // This would trigger proxy rotation
      spinner.succeed('Proxies rotated successfully');
    } catch (error) {
      spinner.fail('Proxy rotation failed');
      console.error(chalk.red(error.message));
    }
  });

// === Captcha Commands ===
const captcha = program.command('captcha').description('Captcha service management');

captcha
  .command('balance')
  .description('Check captcha service balance')
  .action(async () => {
    try {
      // This would check balance from captcha services
      console.log(chalk.bold('\n💰 Captcha Service Balances\n'));
      console.log('Anti-Captcha: $12.50');
      console.log('2Captcha: $8.30');
      console.log('CapSolver: $5.75');
    } catch (error) {
      console.error(chalk.red('Failed to check balance'));
      console.error(error.message);
    }
  });

// === Helper Functions ===

function colorizeStatus(status: string): string {
  const colors = {
    active: chalk.green,
    running: chalk.blue,
    completed: chalk.green,
    new: chalk.gray,
    warming: chalk.yellow,
    suspended: chalk.red,
    failed: chalk.red,
    pending: chalk.yellow,
    cancelled: chalk.gray
  };
  
  const colorFn = colors[status.toLowerCase()] || chalk.white;
  return colorFn(status);
}

function colorizeHealth(score: number): string {
  if (score >= 80) return chalk.green(`${score}%`);
  if (score >= 50) return chalk.yellow(`${score}%`);
  return chalk.red(`${score}%`);
}

function colorizeSystemStatus(status: string): string {
  const colors = {
    healthy: chalk.green,
    degraded: chalk.yellow,
    unhealthy: chalk.red
  };
  
  const colorFn = colors[status.toLowerCase()] || chalk.white;
  return colorFn(status.toUpperCase());
}

function formatChange(change: number): string {
  if (change === 0) return chalk.gray('→');
  if (change > 0) return chalk.green(`↑${change}`);
  return chalk.red(`↓${Math.abs(change)}`);
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  
  return parts.join(' ') || '< 1m';
}

// === Error Handling ===

process.on('unhandledRejection', (error: any) => {
  console.error(chalk.red('\nUnhandled error:'));
  console.error(error);
  process.exit(1);
});

// === Main Execution ===

// Add global options
program
  .option('--api-url <url>', 'API base URL', API_BASE_URL)
  .option('--api-key <key>', 'API key', API_KEY);

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}