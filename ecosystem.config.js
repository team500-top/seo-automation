module.exports = {
  apps: [{
    // Main application
    name: 'seo-automation',
    script: './dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '2G',
    env: {
      NODE_ENV: 'production',
      NODE_OPTIONS: '--max-old-space-size=4096'
    },
    env_development: {
      NODE_ENV: 'development',
      NODE_OPTIONS: '--max-old-space-size=2048'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    merge_logs: true,
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Restart strategies
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
    
    // Monitoring
    instance_var: 'INSTANCE_ID',
    
    // Graceful shutdown
    kill_timeout: 10000,
    wait_ready: true,
    listen_timeout: 10000,
    
    // Advanced features
    post_update: ['npm install', 'npm run build'],
    
    // Health check
    health_check: {
      interval: 30000,
      url: 'http://localhost:3000/health',
      max_failed_checks: 3
    }
  }, {
    // Task worker
    name: 'seo-worker',
    script: './dist/worker.js',
    instances: 2,
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      WORKER_TYPE: 'task'
    },
    error_file: './logs/worker-error.log',
    out_file: './logs/worker-out.log',
    merge_logs: true,
    time: true
  }, {
    // Metrics collector
    name: 'seo-metrics',
    script: './dist/metrics-collector.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/metrics-error.log',
    out_file: './logs/metrics-out.log',
    merge_logs: true,
    time: true
  }],

  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: ['server1.example.com', 'server2.example.com'],
      ref: 'origin/master',
      repo: 'git@github.com:yourusername/seo-automation.git',
      path: '/var/www/seo-automation',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      env: {
        NODE_ENV: 'production'
      }
    },
    staging: {
      user: 'deploy',
      host: 'staging.example.com',
      ref: 'origin/develop',
      repo: 'git@github.com:yourusername/seo-automation.git',
      path: '/var/www/seo-automation-staging',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env staging',
      env: {
        NODE_ENV: 'staging'
      }
    }
  }
};