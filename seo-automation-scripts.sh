#!/bin/bash

# ===== 1. ЕЖЕДНЕВНЫЕ ЗАДАЧИ =====

# daily-routine.sh - Запуск ежедневной рутины
cat > scripts/daily-routine.sh << 'EOF'
#!/bin/bash

echo "🚀 Запуск ежедневной рутины SEO-системы..."

# 1. Проверка здоровья системы
echo "📊 Проверка здоровья системы..."
npm run cli system:health

# 2. Ротация прокси
echo "🔄 Ротация прокси..."
npm run cli proxies:rotate

# 3. Прогрев новых профилей
echo "🔥 Прогрев новых профилей..."
npm run cli profiles:warmup --status new --count 20

# 4. Органическая активность для всех профилей
echo "🌐 Запуск органической активности..."
npm run cli tasks:create \
  --type organic \
  --profiles all \
  --activities "news,video,shopping" \
  --duration 30

# 5. Основные поисковые задачи
echo "🔍 Создание поисковых задач..."
while IFS= read -r line; do
  query=$(echo $line | cut -d'|' -f1)
  target=$(echo $line | cut -d'|' -f2)
  
  npm run cli tasks:create \
    --type search \
    --query "$query" \
    --target "$target" \
    --engine yandex \
    --profiles 30
    
done < config/search-queries.txt

# 6. Очистка старых логов
echo "🧹 Очистка старых логов..."
find logs/ -name "*.log" -mtime +7 -delete

echo "✅ Ежедневная рутина завершена!"
EOF

chmod +x scripts/daily-routine.sh

# ===== 2. МОНИТОРИНГ ПОЗИЦИЙ =====

# monitor-positions.sh - Мониторинг позиций в реальном времени
cat > scripts/monitor-positions.sh << 'EOF'
#!/bin/bash

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

clear
echo "📈 Мониторинг позиций в реальном времени"
echo "========================================="

while true; do
  # Получение текущих позиций
  positions=$(npm run cli metrics:positions --format json 2>/dev/null)
  
  # Очистка экрана и вывод заголовка
  clear
  echo "📈 Мониторинг позиций | $(date '+%Y-%m-%d %H:%M:%S')"
  echo "========================================="
  echo ""
  
  # Парсинг и вывод позиций
  echo "$positions" | jq -r '.positions[] | 
    "\(.query)|\(.domain)|\(.engine)|\(.current_position)|\(.previous_position)|\(.change)"' | 
  while IFS='|' read -r query domain engine current previous change; do
    # Определение цвета на основе изменения
    if [ "$change" -lt 0 ]; then
      color=$GREEN
      symbol="↑"
    elif [ "$change" -gt 0 ]; then
      color=$RED
      symbol="↓"
    else
      color=$YELLOW
      symbol="→"
    fi
    
    printf "%-30s %-20s %-10s %3s ${color}%s %2s${NC}\n" \
      "$query" "$domain" "$engine" "$current" "$symbol" "${change#-}"
  done
  
  echo ""
  echo "Обновление через 60 секунд..."
  sleep 60
done
EOF

chmod +x scripts/monitor-positions.sh

# ===== 3. МАССОВОЕ СОЗДАНИЕ ЗАДАЧ =====

# bulk-tasks.sh - Массовое создание задач из файла
cat > scripts/bulk-tasks.sh << 'EOF'
#!/bin/bash

# Проверка аргументов
if [ $# -eq 0 ]; then
  echo "Использование: $0 <файл_с_задачами>"
  echo "Формат файла: тип|запрос|цель|количество_профилей"
  exit 1
fi

TASK_FILE=$1
TOTAL_TASKS=$(wc -l < "$TASK_FILE")
CURRENT=0

echo "📋 Создание задач из файла: $TASK_FILE"
echo "Всего задач: $TOTAL_TASKS"
echo ""

# Чтение файла и создание задач
while IFS='|' read -r type query target profiles; do
  CURRENT=$((CURRENT + 1))
  
  echo "[$CURRENT/$TOTAL_TASKS] Создание задачи..."
  echo "  Тип: $type"
  echo "  Запрос: $query"
  echo "  Цель: $target"
  echo "  Профили: $profiles"
  
  npm run cli tasks:create \
    --type "$type" \
    --query "$query" \
    --target "$target" \
    --profiles "$profiles" \
    --schedule "distributed"
  
  # Небольшая пауза между задачами
  sleep 2
done < "$TASK_FILE"

echo ""
echo "✅ Все задачи созданы!"
EOF

chmod +x scripts/bulk-tasks.sh

# ===== 4. АНАЛИЗ ЭФФЕКТИВНОСТИ =====

# analyze-performance.sh - Анализ эффективности системы
cat > scripts/analyze-performance.sh << 'EOF'
#!/bin/bash

echo "📊 Анализ эффективности SEO-системы"
echo "===================================="
echo ""

# Период анализа
PERIOD=${1:-"7d"}

echo "Период анализа: $PERIOD"
echo ""

# 1. Общая статистика
echo "📈 Общая статистика:"
npm run cli metrics:summary --period "$PERIOD"

echo ""
echo "🎯 Эффективность по типам задач:"
npm run cli metrics:tasks --group-by type --period "$PERIOD"

echo ""
echo "👥 Топ-10 профилей по эффективности:"
npm run cli profiles:top --limit 10 --period "$PERIOD"

echo ""
echo "⚠️  Проблемные профили:"
npm run cli profiles:list --health-below 50

echo ""
echo "💰 Расходы:"
npm run cli costs:summary --period "$PERIOD"

echo ""
echo "📊 Генерация отчета..."
npm run cli reports:generate \
  --period "$PERIOD" \
  --format pdf \
  --output "reports/weekly-$(date +%Y%m%d).pdf"

echo "✅ Анализ завершен!"
EOF

chmod +x scripts/analyze-performance.sh

# ===== 5. АВАРИЙНОЕ ВОССТАНОВЛЕНИЕ =====

# emergency-recovery.sh - Аварийное восстановление
cat > scripts/emergency-recovery.sh << 'EOF'
#!/bin/bash

echo "🚨 АВАРИЙНОЕ ВОССТАНОВЛЕНИЕ СИСТЕМЫ"
echo "===================================="
echo ""

# 1. Остановка всех задач
echo "⏹️  Остановка всех активных задач..."
npm run cli tasks:stop --all

# 2. Очистка зависших браузеров
echo "🧹 Очистка зависших процессов..."
pkill -f chromium || true
pkill -f chrome || true

# 3. Перезапуск Redis
echo "🔄 Перезапуск Redis..."
docker-compose restart redis

# 4. Очистка очередей
echo "📭 Очистка очередей задач..."
npm run cli queues:clear --force

# 5. Проверка и восстановление профилей
echo "👥 Восстановление профилей..."
npm run cli profiles:repair --all

# 6. Перезапуск системы
echo "🚀 Перезапуск системы..."
pm2 restart seo-automation

# 7. Проверка статуса
sleep 5
echo ""
echo "📊 Проверка статуса:"
npm run cli system:status

echo ""
echo "✅ Восстановление завершено!"
EOF

chmod +x scripts/emergency-recovery.sh

# ===== 6. НАСТРОЙКА CRON =====

# setup-cron.sh - Настройка автоматических задач
cat > scripts/setup-cron.sh << 'EOF'
#!/bin/bash

echo "⏰ Настройка автоматических задач (cron)"
echo "========================================"

# Создание crontab записей
CRON_FILE="/tmp/seo-cron"

cat > $CRON_FILE << 'CRON'
# SEO Automation System Cron Jobs

# Ежедневная рутина (6:00)
0 6 * * * cd /home/user/seo-automation && ./scripts/daily-routine.sh >> logs/cron.log 2>&1

# Проверка здоровья каждые 30 минут
*/30 * * * * cd /home/user/seo-automation && npm run cli system:health-check >> logs/health.log 2>&1

# Ротация прокси каждые 4 часа
0 */4 * * * cd /home/user/seo-automation && npm run cli proxies:rotate >> logs/proxy.log 2>&1

# Анализ эффективности каждую неделю (понедельник 9:00)
0 9 * * 1 cd /home/user/seo-automation && ./scripts/analyze-performance.sh 7d >> logs/analysis.log 2>&1

# Очистка логов каждую ночь (3:00)
0 3 * * * cd /home/user/seo-automation && find logs/ -name "*.log" -size +100M -exec truncate -s 0 {} \;

# Резервное копирование БД каждую ночь (2:00)
0 2 * * * cd /home/user/seo-automation && ./scripts/backup.sh >> logs/backup.log 2>&1
CRON

# Установка crontab
crontab $CRON_FILE
rm $CRON_FILE

echo "✅ Cron задачи установлены!"
echo ""
echo "Просмотр текущих задач: crontab -l"
echo "Редактирование: crontab -e"
EOF

chmod +x scripts/setup-cron.sh