// Region detection utilities for geographic server routing

export type Region = 'us' | 'eu';

// European countries for IP geolocation detection
const EU_COUNTRIES = [
  'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'PL', 'AT', 'SE', 'NO', 'DK', 'FI', 
  'IE', 'PT', 'CZ', 'HU', 'RO', 'BG', 'HR', 'SI', 'SK', 'LT', 'LV', 'EE', 
  'LU', 'MT', 'CY', 'GR', 'GB'
];

export async function detectRegion(): Promise<string> {
  try {
    const response = await fetch('https://ipapi.co/json/', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    const country = data.country_code;
    
    // Map countries to regions
    if (['US', 'CA', 'MX'].includes(country)) {
      return 'us';
    } else if (['GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK', 'FI', 'PL', 'CZ', 'HU', 'RO', 'BG', 'HR', 'SI', 'SK', 'EE', 'LV', 'LT', 'LU', 'MT', 'CY', 'IE', 'PT', 'GR'].includes(country)) {
      return 'eu';
    } else {
      return 'us'; // Default to US
    }
  } catch (error) {
    console.error('Region detection failed:', error);
    return 'us'; // Default to US on error
  }
}

// Method 2: Timezone Detection (Backup)
const detectRegionByTimezone = (): Region => {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    console.log(`Detected timezone: ${timezone}`);
    
    // European timezones
    const isEuropeanTimezone = timezone.startsWith('Europe/') || 
                              timezone === 'GMT' || 
                              timezone === 'UTC' ||
                              timezone.includes('London') ||
                              timezone.includes('Berlin') ||
                              timezone.includes('Paris');
    
    return isEuropeanTimezone ? 'eu' : 'us';
  } catch (error) {
    console.warn('Timezone detection failed:', error);
    return 'us'; // Default fallback
  }
};

// Method 3: Combined Approach (Recommended)
export const detectBestRegion = async (): Promise<Region> => {
  try {
    console.log('Attempting IP geolocation detection...');
    const ipRegion = await detectRegion();
    console.log(`IP geolocation result: ${ipRegion}`);
    return ipRegion === 'eu' ? 'eu' : 'us'; // Map string to Region type
  } catch {
    console.log('IP geolocation failed, falling back to timezone detection...');
    const timezoneRegion = detectRegionByTimezone();
    console.log(`Timezone detection result: ${timezoneRegion}`);
    return timezoneRegion;
  }
};

// Get stored user preference or detect automatically
export const getUserPreferredRegion = async (): Promise<Region> => {
  // Check if user has manually selected a region before
  const storedRegion = localStorage.getItem('preferred-region') as Region;
  
  if (storedRegion && (storedRegion === 'us' || storedRegion === 'eu')) {
    console.log(`Using stored region preference: ${storedRegion}`);
    return storedRegion;
  }
  
  // Auto-detect if no preference stored
  const detectedRegion = await detectBestRegion();
  console.log(`Auto-detected region: ${detectedRegion}`);
  return detectedRegion;
};

// Store user's manual region selection
export const setUserRegionPreference = (region: Region): void => {
  localStorage.setItem('preferred-region', region);
  console.log(`Stored region preference: ${region}`);
};

// Clear stored preference (for auto-detect)
export const clearRegionPreference = (): void => {
  localStorage.removeItem('preferred-region');
  console.log('Cleared region preference - will auto-detect');
};