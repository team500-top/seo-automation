# SEO Automation System 🚀

> Продвинутая система автоматизации SEO для улучшения позиций сайтов в поисковых системах через имитацию естественного поведения пользователей.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?logo=docker&logoColor=white)](https://www.docker.com/)

## 📋 Содержание

- [Возможности](#возможности)
- [Архитектура](#архитектура)
- [Требования](#требования)
- [Быстрый старт](#быстрый-старт)
- [Установка](#установка)
- [Конфигурация](#конфигурация)
- [Использование](#использование)
- [API](#api)
- [Мониторинг](#мониторинг)
- [Безопасность](#безопасность)
- [Устранение неполадок](#устранение-неполадок)
- [Вклад в проект](#вклад-в-проект)
- [Лицензия](#лицензия)

## 🎯 Возможности

### Основные функции

- **200+ уникальных браузерных профилей** с индивидуальными fingerprints
- **Поддержка Яндекс и Google** с региональной настройкой
- **Интеллектуальное планирование задач** с приоритизацией
- **Продвинутая система антидетекта** на базе Playwright Stealth
- **Автоматическое решение капчи** через несколько сервисов
- **Ротация мобильных прокси** с геотаргетингом
- **Детальная аналитика и метрики** в реальном времени

### Технические особенности

- Имитация человеческого поведения (движения мыши, набор текста, скроллинг)
- Прогрев профилей органической активностью
- Мониторинг здоровья профилей и автоматическая оптимизация
- REST API и WebSocket для интеграции
- Grafana дашборды для визуализации
- Telegram уведомления о важных событиях

## 🏗️ Архитектура

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web UI/CLI    │────▶│    REST API     │────▶│  Task Scheduler │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │                         │
                                ▼                         ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │ Profile Manager │     │  Browser Pool   │
                        └─────────────────┘     └─────────────────┘
                                │                         │
                                ▼                         ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │    MongoDB      │     │ Proxy Service   │
                        └─────────────────┘     └─────────────────┘
```

## 💻 Требования

### Минимальные требования
- Ubuntu 20.04 LTS или выше
- 4 CPU ядра
- 16 GB RAM
- 100 GB SSD
- Docker и Docker Compose
- Node.js 20.x

### Рекомендуемые требования
- Ubuntu 22.04 LTS
- 8 CPU ядер
- 32 GB RAM
- 200 GB NVMe SSD
- 1 Gbps интернет

## 🚀 Быстрый старт

```bash
# Клонирование репозитория
git clone https://github.com/yourusername/seo-automation.git
cd seo-automation

# Запуск установочного скрипта
chmod +x scripts/setup.sh
./scripts/setup.sh

# Копирование и настройка конфигурации
cp .env.example .env
nano .env  # Добавьте ваши API ключи

# Запуск системы
docker-compose up -d
npm run build
pm2 start ecosystem.config.js
```

## 📖 Установка

Подробная инструкция по установке доступна в [документации](docs/INSTALLATION.md).

### Основные шаги:

1. **Подготовка сервера**
   ```bash
   sudo apt update && sudo apt upgrade -y
   sudo apt install -y nodejs npm docker.io docker-compose
   ```

2. **Настройка MongoDB и Redis**
   ```bash
   docker-compose up -d mongodb redis
   ```

3. **Установка зависимостей**
   ```bash
   npm install
   npm run build
   ```

4. **Инициализация базы данных**
   ```bash
   npm run cli db:create-indexes
   ```

5. **Создание профилей**
   ```bash
   npm run cli profiles:create --count 50 --region Moscow
   ```

## ⚙️ Конфигурация

### Основные переменные окружения

```env
# Прокси сервис
PROXY_API_KEY=your_proxy_api_key

# Антикапча сервисы  
ANTICAPTCHA_KEY=your_anticaptcha_key
TWOCAPTCHA_KEY=your_2captcha_key

# Настройки браузера
BROWSER_HEADLESS=true
BROWSER_POOL_SIZE=10
MAX_CONCURRENT_TASKS=10

# Мониторинг
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

Полный список настроек в файле [.env.example](.env.example).

## 📱 Использование

### Web интерфейс

Откройте в браузере: `http://localhost:3000`

### CLI команды

```bash
# Управление профилями
npm run cli profiles:list --status active
npm run cli profiles:create --count 10 --region Moscow
npm run cli profiles:warmup --id profile-123

# Управление задачами
npm run cli tasks:create --type search --query "купить телефон" --target example.com
npm run cli tasks:status --id task-456

# Метрики
npm run cli metrics:positions --domain example.com
npm run cli metrics:summary --period 7d

# Система
npm run cli system:status
npm run cli system:health-check
```

### Пример создания поисковой кампании

```bash
# 1. Создать профили
npm run cli profiles:create --count 100 --region Moscow --warmup

# 2. Загрузить поисковые запросы
cat > queries.txt << EOF
купить телефон|example.com
интернет магазин телефонов|example.com
EOF

# 3. Создать задачи
npm run cli tasks:create-bulk --file queries.txt --profiles-per-query 20

# 4. Мониторить результаты
npm run cli metrics:positions --domain example.com
```

## 🔌 API

### Основные эндпоинты

```http
# Профили
GET    /api/profiles
POST   /api/profiles
GET    /api/profiles/:id
PUT    /api/profiles/:id

# Задачи
GET    /api/tasks
POST   /api/tasks
POST   /api/tasks/bulk
DELETE /api/tasks/:id

# Метрики
GET    /api/metrics/current
GET    /api/metrics/positions
GET    /api/metrics/costs

# Система
GET    /api/system/status
POST   /api/system/stop
```

Полная документация API: [docs/API.md](docs/API.md)

## 📊 Мониторинг

### Grafana дашборды

- **Обзорная панель**: `http://localhost:3001/d/overview`
- **Профили**: `http://localhost:3001/d/profiles`
- **Задачи**: `http://localhost:3001/d/tasks`
- **Производительность**: `http://localhost:3001/d/performance`

### Prometheus метрики

- **Endpoint**: `http://localhost:9090`
- **Targets**: `http://localhost:9090/targets`

### Алерты

Система отправляет уведомления в Telegram о:
- Критических ошибках
- Низком балансе сервисов
- Проблемах с прокси
- Падении позиций

## 🔒 Безопасность

- Все API запросы требуют аутентификацию
- Пароли и ключи хранятся в зашифрованном виде
- Поддержка IP whitelist/blacklist
- Rate limiting для защиты от DDoS
- Регулярные бэкапы базы данных

## 🛠️ Устранение неполадок

### Частые проблемы

**Браузеры падают**
```bash
# Уменьшить пул браузеров
BROWSER_POOL_SIZE=5

# Увеличить память Node.js
NODE_OPTIONS="--max-old-space-size=8192"
```

**Высокая частота капчи**
```bash
# Увеличить задержки
TASK_MIN_DELAY=10000
TASK_MAX_DELAY=30000

# Добавить больше органической активности
npm run cli tasks:create --type organic --profiles all
```

**Прокси блокируются**
```bash
# Проверить прокси
npm run cli proxies:test

# Увеличить интервал ротации
PROXY_ROTATION_INTERVAL=600000
```

Подробное руководство: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

## 🤝 Вклад в проект

Мы приветствуем вклад в развитие проекта! 

1. Fork репозитория
2. Создайте ветку для фичи (`git checkout -b feature/AmazingFeature`)
3. Commit изменений (`git commit -m 'Add AmazingFeature'`)
4. Push в ветку (`git push origin feature/AmazingFeature`)
5. Откройте Pull Request

## 📄 Лицензия

Этот проект лицензирован под MIT License - см. файл [LICENSE](LICENSE.txt) для деталей.

## ⚠️ Отказ от ответственности

Данное ПО предоставляется только для образовательных и исследовательских целей. Пользователи несут ответственность за соблюдение условий использования поисковых систем и местного законодательства.

## 📞 Поддержка

- 📧 Email: support@example.com
- 💬 Telegram: @seo_automation_support
- 📚 Wiki: [github.com/yourusername/seo-automation/wiki](https://github.com/yourusername/seo-automation/wiki)

---

Сделано с ❤️ командой SEO Automation