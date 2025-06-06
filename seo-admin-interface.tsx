import React, { useState, useEffect } from 'react';
import { Activity, Users, Target, TrendingUp, AlertCircle, Settings, Play, Pause, RefreshCw, Search, Globe, Clock, DollarSign } from 'lucide-react';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [systemStatus, setSystemStatus] = useState('running');
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [taskForm, setTaskForm] = useState({
    type: 'search',
    engine: 'yandex',
    query: '',
    targetUrl: '',
    profileCount: 10
  });

  // Симуляция данных для демонстрации
  const stats = {
    totalProfiles: 200,
    activeProfiles: 156,
    tasksToday: 1247,
    successRate: 94.3,
    avgPosition: 12.4,
    positionChange: -3.2
  };

  const profiles = [
    { id: 1, name: 'Profile-001', status: 'active', lastActive: '5 мин назад', health: 95, tasks: 23 },
    { id: 2, name: 'Profile-002', status: 'active', lastActive: '12 мин назад', health: 88, tasks: 19 },
    { id: 3, name: 'Profile-003', status: 'warming', lastActive: '1 час назад', health: 72, tasks: 5 },
    { id: 4, name: 'Profile-004', status: 'suspended', lastActive: '3 часа назад', health: 45, tasks: 0 },
  ];

  const recentTasks = [
    { id: 1, type: 'search', query: 'купить телефон', status: 'completed', duration: '3:24', profile: 'Profile-023' },
    { id: 2, type: 'target_visit', url: 'example.com', status: 'running', duration: '1:45', profile: 'Profile-067' },
    { id: 3, type: 'organic', category: 'новости', status: 'completed', duration: '5:12', profile: 'Profile-134' },
  ];

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Активные профили</p>
              <p className="text-2xl font-bold">{stats.activeProfiles}/{stats.totalProfiles}</p>
            </div>
            <Users className="h-8 w-8 text-blue-500" />
          </div>
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full" style={{width: `${(stats.activeProfiles/stats.totalProfiles)*100}%`}}></div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Задачи сегодня</p>
              <p className="text-2xl font-bold">{stats.tasksToday}</p>
            </div>
            <Activity className="h-8 w-8 text-green-500" />
          </div>
          <p className="text-sm text-green-600 mt-2">↑ 12.5% от вчера</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Успешность</p>
              <p className="text-2xl font-bold">{stats.successRate}%</p>
            </div>
            <Target className="h-8 w-8 text-purple-500" />
          </div>
          <p className="text-sm text-gray-600 mt-2">Последний час</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-500 text-sm">Средняя позиция</p>
              <p className="text-2xl font-bold">{stats.avgPosition}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-orange-500" />
          </div>
          <p className="text-sm text-green-600 mt-2">↑ {Math.abs(stats.positionChange)} позиции</p>
        </div>
      </div>

      {/* График активности */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Активность за последние 24 часа</h3>
        <div className="h-64 flex items-end space-x-2">
          {Array.from({length: 24}, (_, i) => {
            const height = Math.random() * 100;
            return (
              <div key={i} className="flex-1 bg-blue-500 rounded-t hover:bg-blue-600 transition-colors" 
                   style={{height: `${height}%`}}
                   title={`${i}:00 - ${Math.round(height * 10)} задач`}>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>23:00</span>
        </div>
      </div>

      {/* Последние задачи */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Последние задачи</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-500 text-sm">
                <th className="pb-2">Тип</th>
                <th className="pb-2">Детали</th>
                <th className="pb-2">Профиль</th>
                <th className="pb-2">Длительность</th>
                <th className="pb-2">Статус</th>
              </tr>
            </thead>
            <tbody>
              {recentTasks.map(task => (
                <tr key={task.id} className="border-t">
                  <td className="py-2">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100">
                      {task.type === 'search' && <Search className="w-3 h-3 mr-1" />}
                      {task.type === 'target_visit' && <Globe className="w-3 h-3 mr-1" />}
                      {task.type === 'organic' && <Activity className="w-3 h-3 mr-1" />}
                      {task.type}
                    </span>
                  </td>
                  <td className="py-2 text-sm">{task.query || task.url || task.category}</td>
                  <td className="py-2 text-sm">{task.profile}</td>
                  <td className="py-2 text-sm">{task.duration}</td>
                  <td className="py-2">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      task.status === 'completed' ? 'bg-green-100 text-green-800' : 
                      task.status === 'running' ? 'bg-blue-100 text-blue-800' : 
                      'bg-red-100 text-red-800'
                    }`}>
                      {task.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderProfiles = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Управление профилями</h3>
          <div className="space-x-2">
            <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
              Создать профили
            </button>
            <button className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
              Запустить прогрев
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map(profile => (
            <div key={profile.id} className="border rounded-lg p-4 hover:shadow-lg transition-shadow cursor-pointer"
                 onClick={() => setSelectedProfile(profile)}>
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-medium">{profile.name}</h4>
                <span className={`px-2 py-1 rounded text-xs ${
                  profile.status === 'active' ? 'bg-green-100 text-green-800' :
                  profile.status === 'warming' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {profile.status}
                </span>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Здоровье:</span>
                  <span className={profile.health > 80 ? 'text-green-600' : profile.health > 50 ? 'text-yellow-600' : 'text-red-600'}>
                    {profile.health}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Задачи сегодня:</span>
                  <span>{profile.tasks}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Последняя активность:</span>
                  <span className="text-xs">{profile.lastActive}</span>
                </div>
              </div>

              <div className="mt-3 flex space-x-2">
                <button className="flex-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200">
                  Детали
                </button>
                <button className="flex-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200">
                  Задачи
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedProfile && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Детали профиля: {selectedProfile.name}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">Fingerprint</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">User Agent:</span>
                  <span className="text-xs">Chrome 120.0 Windows</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Разрешение:</span>
                  <span>1920x1080</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Язык:</span>
                  <span>ru-RU</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Часовой пояс:</span>
                  <span>Europe/Moscow</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">Статистика</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Всего задач:</span>
                  <span>342</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Успешных:</span>
                  <span>318 (93%)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Капч решено:</span>
                  <span>12</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Время работы:</span>
                  <span>48ч 23м</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderTasks = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Создание задачи</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Тип задачи
            </label>
            <select 
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={taskForm.type}
              onChange={(e) => setTaskForm({...taskForm, type: e.target.value})}
            >
              <option value="search">Поисковый запрос</option>
              <option value="target_visit">Прямой визит</option>
              <option value="organic">Органическая активность</option>
              <option value="warmup">Прогрев профилей</option>
            </select>
          </div>

          {taskForm.type === 'search' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Поисковая система
                </label>
                <select 
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={taskForm.engine}
                  onChange={(e) => setTaskForm({...taskForm, engine: e.target.value})}
                >
                  <option value="yandex">Яндекс</option>
                  <option value="google">Google</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Поисковый запрос
                </label>
                <input 
                  type="text"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="купить телефон москва"
                  value={taskForm.query}
                  onChange={(e) => setTaskForm({...taskForm, query: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Целевой URL/домен
                </label>
                <input 
                  type="text"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="example.com"
                  value={taskForm.targetUrl}
                  onChange={(e) => setTaskForm({...taskForm, targetUrl: e.target.value})}
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Количество профилей
            </label>
            <input 
              type="number"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={taskForm.profileCount}
              onChange={(e) => setTaskForm({...taskForm, profileCount: parseInt(e.target.value)})}
              min="1"
              max="200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Регион (опционально)
            </label>
            <input 
              type="text"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Москва"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end space-x-3">
          <button className="px-4 py-2 border rounded-lg hover:bg-gray-50">
            Отмена
          </button>
          <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center">
            <Play className="w-4 h-4 mr-2" />
            Создать задачу
          </button>
        </div>
      </div>

      {/* Шаблоны задач */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Быстрые действия</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="p-4 border rounded-lg hover:shadow-lg transition-shadow text-left">
            <h4 className="font-medium mb-2">Массовый прогрев</h4>
            <p className="text-sm text-gray-600">Запустить прогрев всех новых профилей</p>
            <p className="text-xs text-gray-500 mt-2">50 профилей готовы</p>
          </button>
          
          <button className="p-4 border rounded-lg hover:shadow-lg transition-shadow text-left">
            <h4 className="font-medium mb-2">Ежедневная активность</h4>
            <p className="text-sm text-gray-600">Органические визиты на популярные сайты</p>
            <p className="text-xs text-gray-500 mt-2">Рекомендуется ежедневно</p>
          </button>
          
          <button className="p-4 border rounded-lg hover:shadow-lg transition-shadow text-left">
            <h4 className="font-medium mb-2">Конкурентный анализ</h4>
            <p className="text-sm text-gray-600">Мониторинг позиций конкурентов</p>
            <p className="text-xs text-gray-500 mt-2">Последний: 3 дня назад</p>
          </button>
        </div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Настройки системы</h3>
        
        <div className="space-y-6">
          {/* Основные настройки */}
          <div>
            <h4 className="font-medium mb-3">Основные параметры</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Максимум параллельных профилей
                </label>
                <input type="number" className="w-full px-3 py-2 border rounded-lg" defaultValue="10" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Таймаут задачи (секунды)
                </label>
                <input type="number" className="w-full px-3 py-2 border rounded-lg" defaultValue="300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Интервал ротации прокси (минуты)
                </label>
                <input type="number" className="w-full px-3 py-2 border rounded-lg" defaultValue="5" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Режим браузера
                </label>
                <select className="w-full px-3 py-2 border rounded-lg">
                  <option value="headless">Headless (быстрый)</option>
                  <option value="headed">С интерфейсом (отладка)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Прокси */}
          <div>
            <h4 className="font-medium mb-3">Настройки прокси</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 border rounded">
                <div>
                  <p className="font-medium">mobile-proxies.ru</p>
                  <p className="text-sm text-gray-500">200 IP адресов, Россия</p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">Активен</span>
                  <button className="text-blue-500 hover:text-blue-700">Настроить</button>
                </div>
              </div>
            </div>
          </div>

          {/* Антикапча */}
          <div>
            <h4 className="font-medium mb-3">Сервисы антикапчи</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 border rounded">
                <div>
                  <p className="font-medium">Anti-Captcha</p>
                  <p className="text-sm text-gray-500">Баланс: $12.50</p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm">Успешность: 94%</span>
                  <button className="text-blue-500 hover:text-blue-700">API ключ</button>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 border rounded">
                <div>
                  <p className="font-medium">2Captcha</p>
                  <p className="text-sm text-gray-500">Баланс: $8.30</p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm">Успешность: 91%</span>
                  <button className="text-blue-500 hover:text-blue-700">API ключ</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
            Сохранить настройки
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold">SEO Automation</h1>
              <span className={`px-3 py-1 rounded-full text-sm ${
                systemStatus === 'running' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {systemStatus === 'running' ? 'Система работает' : 'Остановлена'}
              </span>
            </div>
            
            <div className="flex items-center space-x-3">
              <button className="p-2 text-gray-500 hover:text-gray-700">
                <RefreshCw className="w-5 h-5" />
              </button>
              <button 
                className={`px-4 py-2 rounded-lg flex items-center ${
                  systemStatus === 'running' 
                    ? 'bg-red-500 text-white hover:bg-red-600' 
                    : 'bg-green-500 text-white hover:bg-green-600'
                }`}
                onClick={() => setSystemStatus(systemStatus === 'running' ? 'stopped' : 'running')}
              >
                {systemStatus === 'running' ? (
                  <>
                    <Pause className="w-4 h-4 mr-2" />
                    Остановить
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Запустить
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: 'Обзор', icon: Activity },
              { id: 'profiles', label: 'Профили', icon: Users },
              { id: 'tasks', label: 'Задачи', icon: Target },
              { id: 'settings', label: 'Настройки', icon: Settings },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-1 py-4 border-b-2 text-sm font-medium ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="w-4 h-4 mr-2" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'profiles' && renderProfiles()}
        {activeTab === 'tasks' && renderTasks()}
        {activeTab === 'settings' && renderSettings()}
      </div>
    </div>
  );
};

export default AdminDashboard;