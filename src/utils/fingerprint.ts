import { createHash } from 'crypto';
import { faker } from '@faker-js/faker';
import { BrowserFingerprint, PluginData } from '../types';
import { CONSTANTS } from '../config/constants';

interface FingerprintOptions {
  deviceType: 'desktop' | 'mobile' | 'tablet';
  location: {
    country: string;
    languages: string[];
    timezone: string;
  };
}

export async function generateFingerprint(options: FingerprintOptions): Promise<BrowserFingerprint> {
  const { deviceType, location } = options;
  
  // Select appropriate user agent
  const userAgent = selectUserAgent(deviceType);
  
  // Generate screen properties
  const screen = generateScreenProperties(deviceType);
  
  // Generate window properties
  const window = generateWindowProperties(screen);
  
  // Generate hardware properties
  const hardware = generateHardwareProperties(deviceType);
  
  // Generate WebGL properties
  const webGL = generateWebGLProperties();
  
  // Generate Canvas fingerprint
  const canvas = await generateCanvasFingerprint();
  
  // Generate Audio fingerprint
  const audio = generateAudioFingerprint();
  
  // Generate fonts list
  const fonts = generateFontsList(userAgent);
  
  // Generate plugins
  const plugins = generatePlugins(userAgent);
  
  // Generate media devices
  const mediaDevices = generateMediaDevices(deviceType);
  
  // Generate permissions
  const permissions = generatePermissions();
  
  // Generate features
  const features = generateFeatures(location);
  
  // Network and battery (optional)
  const network = deviceType === 'mobile' ? generateNetworkInfo() : undefined;
  const battery = deviceType === 'mobile' ? generateBatteryInfo() : undefined;
  
  return {
    userAgent,
    platform: getPlatform(userAgent),
    vendor: getVendor(userAgent),
    screen,
    window,
    hardware,
    webGL,
    canvas,
    audio,
    fonts,
    plugins,
    mediaDevices,
    permissions,
    features,
    network,
    battery
  };
}

function selectUserAgent(deviceType: string): string {
  const userAgents = CONSTANTS.USER_AGENTS[deviceType.toUpperCase()];
  const baseUA = faker.helpers.arrayElement(userAgents);
  
  // Update version numbers to be more current
  return updateUserAgentVersions(baseUA);
}

function updateUserAgentVersions(userAgent: string): string {
  // Chrome version update
  if (userAgent.includes('Chrome/')) {
    const chromeVersion = 120 + faker.number.int({ min: 0, max: 5 });
    userAgent = userAgent.replace(/Chrome\/\d+/, `Chrome/${chromeVersion}`);
  }
  
  // Firefox version update
  if (userAgent.includes('Firefox/')) {
    const firefoxVersion = 121 + faker.number.int({ min: 0, max: 5 });
    userAgent = userAgent.replace(/Firefox\/\d+/, `Firefox/${firefoxVersion}`);
  }
  
  // Safari version update
  if (userAgent.includes('Version/')) {
    const safariVersion = 17 + faker.number.int({ min: 0, max: 2 });
    userAgent = userAgent.replace(/Version\/\d+/, `Version/${safariVersion}`);
  }
  
  return userAgent;
}

function generateScreenProperties(deviceType: string): any {
  const resolutions = CONSTANTS.SCREEN_RESOLUTIONS[deviceType.toUpperCase()];
  const resolution = faker.helpers.arrayElement(resolutions);
  
  // Add some variance to avoid exact matches
  const variance = deviceType === 'desktop' ? 0 : faker.number.int({ min: -10, max: 10 });
  
  const screen = {
    width: resolution.width + variance,
    height: resolution.height + variance,
    availWidth: resolution.width + variance,
    availHeight: resolution.height + variance - (deviceType === 'desktop' ? 40 : 20), // Taskbar
    colorDepth: 24,
    pixelDepth: 24,
    devicePixelRatio: deviceType === 'desktop' ? 1 : faker.helpers.arrayElement([1, 1.5, 2, 2.5, 3])
  };
  
  // Add orientation for mobile/tablet
  if (deviceType !== 'desktop') {
    screen.orientation = {
      angle: 0,
      type: resolution.width > resolution.height ? 'landscape-primary' : 'portrait-primary'
    };
  }
  
  return screen;
}

function generateWindowProperties(screen: any): any {
  // Window is slightly smaller than screen (browser chrome)
  const chromeHeight = faker.number.int({ min: 80, max: 120 });
  const chromeSides = faker.number.int({ min: 0, max: 10 });
  
  return {
    innerWidth: screen.availWidth - chromeSides,
    innerHeight: screen.availHeight - chromeHeight,
    outerWidth: screen.availWidth,
    outerHeight: screen.availHeight,
    screenX: faker.number.int({ min: 0, max: 100 }),
    screenY: faker.number.int({ min: 0, max: 100 })
  };
}

function generateHardwareProperties(deviceType: string): any {
  const hardware: any = {
    hardwareConcurrency: faker.helpers.arrayElement([2, 4, 6, 8, 12, 16]),
    maxTouchPoints: deviceType === 'desktop' ? 0 : faker.helpers.arrayElement([1, 5, 10])
  };
  
  // Add optional properties with some probability
  if (Math.random() > 0.3) {
    hardware.deviceMemory = faker.helpers.arrayElement([2, 4, 8, 16, 32]);
  }
  
  return hardware;
}

function generateWebGLProperties(): any {
  const vendors = [
    'Google Inc. (Intel)',
    'Google Inc. (NVIDIA)',
    'Google Inc. (AMD)',
    'Google Inc. (Apple)',
    'Google Inc.'
  ];
  
  const renderers = [
    'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)',
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0)',
    'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0)',
    'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)',
    'Apple GPU'
  ];
  
  return {
    vendor: faker.helpers.arrayElement(vendors),
    renderer: faker.helpers.arrayElement(renderers),
    version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
    shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)',
    extensions: generateWebGLExtensions(),
    parameters: generateWebGLParameters()
  };
}

function generateWebGLExtensions(): string[] {
  const allExtensions = [
    'ANGLE_instanced_arrays',
    'EXT_blend_minmax',
    'EXT_color_buffer_half_float',
    'EXT_disjoint_timer_query',
    'EXT_float_blend',
    'EXT_frag_depth',
    'EXT_shader_texture_lod',
    'EXT_texture_compression_bptc',
    'EXT_texture_compression_rgtc',
    'EXT_texture_filter_anisotropic',
    'EXT_sRGB',
    'KHR_parallel_shader_compile',
    'OES_element_index_uint',
    'OES_fbo_render_mipmap',
    'OES_standard_derivatives',
    'OES_texture_float',
    'OES_texture_float_linear',
    'OES_texture_half_float',
    'OES_texture_half_float_linear',
    'OES_vertex_array_object',
    'WEBGL_color_buffer_float',
    'WEBGL_compressed_texture_s3tc',
    'WEBGL_compressed_texture_s3tc_srgb',
    'WEBGL_debug_renderer_info',
    'WEBGL_debug_shaders',
    'WEBGL_depth_texture',
    'WEBGL_draw_buffers',
    'WEBGL_lose_context',
    'WEBGL_multi_draw'
  ];
  
  // Return 80-95% of extensions
  const count = Math.floor(allExtensions.length * (0.8 + Math.random() * 0.15));
  return faker.helpers.arrayElements(allExtensions, count).sort();
}

function generateWebGLParameters(): Record<string, any> {
  return {
    MAX_COMBINED_TEXTURE_IMAGE_UNITS: 32,
    MAX_CUBE_MAP_TEXTURE_SIZE: 16384,
    MAX_FRAGMENT_UNIFORM_VECTORS: 1024,
    MAX_RENDERBUFFER_SIZE: 16384,
    MAX_TEXTURE_IMAGE_UNITS: 16,
    MAX_TEXTURE_SIZE: 16384,
    MAX_VARYING_VECTORS: 30,
    MAX_VERTEX_ATTRIBS: 16,
    MAX_VERTEX_TEXTURE_IMAGE_UNITS: 16,
    MAX_VERTEX_UNIFORM_VECTORS: 4096,
    MAX_VIEWPORT_DIMS: [32767, 32767],
    ALIASED_LINE_WIDTH_RANGE: [1, 1],
    ALIASED_POINT_SIZE_RANGE: [1, 1024],
    MAX_ANISOTROPY: 16
  };
}

async function generateCanvasFingerprint(): Promise<any> {
  // Generate unique but consistent canvas fingerprint
  const text = 'Canvas fingerprint 🎨 测试';
  const uniqueId = faker.string.uuid();
  
  // Create hash that looks like real canvas data
  const hash = createHash('sha256')
    .update(text + uniqueId)
    .digest('hex');
  
  return {
    fingerprint: hash,
    // Don't include actual dataURL in production to save space
    dataURL: undefined
  };
}

function generateAudioFingerprint(): any {
  // Common audio configurations
  const sampleRates = [44100, 48000];
  const channelCounts = [2]; // Stereo is most common
  
  const sampleRate = faker.helpers.arrayElement(sampleRates);
  const channelCount = faker.helpers.arrayElement(channelCounts);
  
  // Generate consistent fingerprint
  const fingerprint = createHash('sha256')
    .update(`${sampleRate}-${channelCount}-${faker.string.uuid()}`)
    .digest('hex')
    .substring(0, 16);
  
  return {
    sampleRate,
    channelCount,
    fingerprint
  };
}

function generateFontsList(userAgent: string): string[] {
  const baseFonts = [
    'Arial',
    'Arial Black',
    'Comic Sans MS',
    'Courier New',
    'Georgia',
    'Impact',
    'Times New Roman',
    'Trebuchet MS',
    'Verdana'
  ];
  
  const windowsFonts = [
    'Calibri',
    'Cambria',
    'Consolas',
    'Lucida Console',
    'Lucida Sans Unicode',
    'Microsoft Sans Serif',
    'Segoe UI',
    'Tahoma'
  ];
  
  const macFonts = [
    'American Typewriter',
    'Andale Mono',
    'Apple Chancery',
    'Avenir',
    'Helvetica',
    'Helvetica Neue',
    'Monaco',
    'Palatino'
  ];
  
  let fonts = [...baseFonts];
  
  if (userAgent.includes('Windows')) {
    fonts.push(...windowsFonts);
  } else if (userAgent.includes('Mac')) {
    fonts.push(...macFonts);
  }
  
  // Add some random variation
  const extraFonts = [
    'Century Gothic',
    'Franklin Gothic Medium',
    'Garamond',
    'Gill Sans',
    'Lucida Bright',
    'Rockwell'
  ];
  
  const additionalCount = faker.number.int({ min: 2, max: 5 });
  fonts.push(...faker.helpers.arrayElements(extraFonts, additionalCount));
  
  return [...new Set(fonts)].sort();
}

function generatePlugins(userAgent: string): PluginData[] {
  const plugins: PluginData[] = [];
  
  // Chrome/Chromium plugins
  if (userAgent.includes('Chrome')) {
    plugins.push({
      name: 'PDF Viewer',
      filename: 'internal-pdf-viewer',
      description: 'Portable Document Format'
    });
    
    plugins.push({
      name: 'Chrome PDF Viewer',
      filename: 'internal-pdf-viewer',
      description: 'Portable Document Format'
    });
    
    if (Math.random() > 0.5) {
      plugins.push({
        name: 'Native Client',
        filename: 'internal-nacl-plugin',
        description: 'Native Client Executable'
      });
    }
  }
  
  // Firefox plugins
  if (userAgent.includes('Firefox')) {
    // Firefox has very few plugins in modern versions
    if (Math.random() > 0.8) {
      plugins.push({
        name: 'OpenH264 Video Codec',
        filename: 'gmp-gmpopenh264.dll',
        description: 'OpenH264 Video Codec provided by Cisco Systems, Inc.',
        version: '1.8.1.1'
      });
    }
  }
  
  return plugins;
}

function generateMediaDevices(deviceType: string): any[] {
  const devices: any[] = [];
  
  // Audio input devices
  const audioInputCount = deviceType === 'desktop' ? faker.number.int({ min: 1, max: 3 }) : 1;
  for (let i = 0; i < audioInputCount; i++) {
    devices.push({
      deviceId: faker.string.uuid(),
      kind: 'audioinput',
      label: i === 0 ? 'Default - Microphone' : `Microphone ${i}`,
      groupId: faker.string.uuid()
    });
  }
  
  // Audio output devices
  const audioOutputCount = deviceType === 'desktop' ? faker.number.int({ min: 1, max: 3 }) : 1;
  for (let i = 0; i < audioOutputCount; i++) {
    devices.push({
      deviceId: faker.string.uuid(),
      kind: 'audiooutput',
      label: i === 0 ? 'Default - Speakers' : `Speakers ${i}`,
      groupId: faker.string.uuid()
    });
  }
  
  // Video input devices
  const videoInputCount = faker.number.int({ min: 0, max: deviceType === 'desktop' ? 2 : 1 });
  for (let i = 0; i < videoInputCount; i++) {
    devices.push({
      deviceId: faker.string.uuid(),
      kind: 'videoinput',
      label: i === 0 ? 'Integrated Camera' : `USB Camera ${i}`,
      groupId: faker.string.uuid()
    });
  }
  
  return devices;
}

function generatePermissions(): Record<string, string> {
  return {
    geolocation: 'prompt',
    notifications: 'prompt',
    push: 'prompt',
    midi: 'prompt',
    camera: 'prompt',
    microphone: 'prompt',
    'speaker-selection': 'prompt',
    'device-info': 'prompt',
    'background-fetch': 'prompt',
    'background-sync': 'prompt',
    bluetooth: 'prompt',
    'persistent-storage': 'prompt',
    'ambient-light-sensor': 'prompt',
    accelerometer: 'prompt',
    gyroscope: 'prompt',
    magnetometer: 'prompt',
    clipboard: 'prompt',
    'screen-wake-lock': 'prompt',
    nfc: 'prompt',
    display: 'prompt'
  };
}

function generateFeatures(location: any): any {
  return {
    cookieEnabled: true,
    doNotTrack: faker.helpers.arrayElement(['1', null]),
    languages: location.languages,
    onLine: true,
    pdfViewerEnabled: true,
    webdriver: false,
    bluetooth: Math.random() > 0.5
  };
}

function generateNetworkInfo(): any {
  return {
    effectiveType: faker.helpers.arrayElement(['4g', '3g']),
    downlink: faker.number.float({ min: 1.5, max: 10, precision: 0.1 }),
    rtt: faker.number.int({ min: 50, max: 200 }),
    saveData: false
  };
}

function generateBatteryInfo(): any {
  const charging = Math.random() > 0.5;
  const level = faker.number.float({ min: 0.2, max: 1, precision: 0.01 });
  
  return {
    charging,
    level,
    chargingTime: charging ? faker.number.int({ min: 0, max: 7200 }) : Infinity,
    dischargingTime: !charging ? faker.number.int({ min: 3600, max: 28800 }) : Infinity
  };
}

function getPlatform(userAgent: string): string {
  if (userAgent.includes('Windows')) return 'Win32';
  if (userAgent.includes('Mac')) return 'MacIntel';
  if (userAgent.includes('Linux')) return 'Linux x86_64';
  if (userAgent.includes('Android')) return 'Linux armv8l';
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iPhone';
  return 'Unknown';
}

function getVendor(userAgent: string): string {
  if (userAgent.includes('Chrome')) return 'Google Inc.';
  if (userAgent.includes('Firefox')) return '';
  if (userAgent.includes('Safari')) return 'Apple Computer, Inc.';
  return '';
}

// Utility function to ensure fingerprint consistency
export function validateFingerprint(fingerprint: BrowserFingerprint): boolean {
  // Check basic consistency
  if (!fingerprint.userAgent || !fingerprint.screen || !fingerprint.window) {
    return false;
  }
  
  // Check screen/window consistency
  if (fingerprint.window.innerWidth > fingerprint.screen.width ||
      fingerprint.window.innerHeight > fingerprint.screen.height) {
    return false;
  }
  
  // Check platform consistency
  const platform = fingerprint.platform;
  const userAgent = fingerprint.userAgent;
  
  if (platform === 'Win32' && !userAgent.includes('Windows')) return false;
  if (platform === 'MacIntel' && !userAgent.includes('Mac')) return false;
  
  return true;
}

// Function to add noise to existing fingerprint
export function addFingerprintNoise(fingerprint: BrowserFingerprint): BrowserFingerprint {
  const noisy = { ...fingerprint };
  
  // Add slight variations to numeric values
  if (noisy.window) {
    noisy.window.screenX += faker.number.int({ min: -5, max: 5 });
    noisy.window.screenY += faker.number.int({ min: -5, max: 5 });
  }
  
  // Regenerate canvas fingerprint
  noisy.canvas.fingerprint = createHash('sha256')
    .update(noisy.canvas.fingerprint + Date.now())
    .digest('hex');
  
  return noisy;
}