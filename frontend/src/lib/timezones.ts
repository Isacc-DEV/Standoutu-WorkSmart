export type TimezoneOption = {
  id: string;
  label: string;
  graph: string;
  calendar: string;
};

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { id: 'UTC', label: 'UTC', graph: 'UTC', calendar: 'UTC' },
  // Americas
  { id: 'AMERICA_HONOLULU', label: 'Hawaii (Honolulu)', graph: 'Hawaiian Standard Time', calendar: 'Pacific/Honolulu' },
  { id: 'AMERICA_ANCHORAGE', label: 'Alaska (Anchorage)', graph: 'Alaskan Standard Time', calendar: 'America/Anchorage' },
  { id: 'AMERICA_LOS_ANGELES', label: 'Pacific Time (Los Angeles)', graph: 'Pacific Standard Time', calendar: 'America/Los_Angeles' },
  { id: 'AMERICA_DENVER', label: 'Mountain Time (Denver)', graph: 'Mountain Standard Time', calendar: 'America/Denver' },
  { id: 'AMERICA_PHOENIX', label: 'Arizona (Phoenix)', graph: 'US Mountain Standard Time', calendar: 'America/Phoenix' },
  { id: 'AMERICA_CHICAGO', label: 'Central Time (Chicago)', graph: 'Central Standard Time', calendar: 'America/Chicago' },
  { id: 'AMERICA_NEW_YORK', label: 'Eastern Time (New York)', graph: 'Eastern Standard Time', calendar: 'America/New_York' },
  { id: 'AMERICA_HALIFAX', label: 'Atlantic Time (Halifax)', graph: 'Atlantic Standard Time', calendar: 'America/Halifax' },
  { id: 'AMERICA_ST_JOHNS', label: 'Newfoundland (St Johns)', graph: 'Newfoundland Standard Time', calendar: 'America/St_Johns' },
  { id: 'AMERICA_BOGOTA', label: 'Bogota / Lima', graph: 'SA Pacific Standard Time', calendar: 'America/Bogota' },
  { id: 'AMERICA_CARACAS', label: 'Caracas', graph: 'Venezuela Standard Time', calendar: 'America/Caracas' },
  { id: 'AMERICA_LA_PAZ', label: 'La Paz', graph: 'SA Western Standard Time', calendar: 'America/La_Paz' },
  { id: 'AMERICA_SANTIAGO', label: 'Santiago', graph: 'Pacific SA Standard Time', calendar: 'America/Santiago' },
  { id: 'AMERICA_SAO_PAULO', label: 'Sao Paulo', graph: 'E. South America Standard Time', calendar: 'America/Sao_Paulo' },
  { id: 'AMERICA_BUENOS_AIRES', label: 'Buenos Aires', graph: 'Argentina Standard Time', calendar: 'America/Argentina/Buenos_Aires' },
  // Europe
  { id: 'EUROPE_LONDON', label: 'London', graph: 'GMT Standard Time', calendar: 'Europe/London' },
  { id: 'EUROPE_BERLIN', label: 'Berlin', graph: 'W. Europe Standard Time', calendar: 'Europe/Berlin' },
  { id: 'EUROPE_PARIS', label: 'Paris', graph: 'Romance Standard Time', calendar: 'Europe/Paris' },
  { id: 'EUROPE_BUDAPEST', label: 'Budapest', graph: 'Central Europe Standard Time', calendar: 'Europe/Budapest' },
  { id: 'EUROPE_WARSAW', label: 'Warsaw', graph: 'Central European Standard Time', calendar: 'Europe/Warsaw' },
  { id: 'EUROPE_BUCHAREST', label: 'Bucharest', graph: 'E. Europe Standard Time', calendar: 'Europe/Bucharest' },
  { id: 'EUROPE_HELSINKI', label: 'Helsinki', graph: 'FLE Standard Time', calendar: 'Europe/Helsinki' },
  { id: 'EUROPE_ISTANBUL', label: 'Istanbul', graph: 'Turkey Standard Time', calendar: 'Europe/Istanbul' },
  { id: 'EUROPE_MOSCOW', label: 'Moscow', graph: 'Russian Standard Time', calendar: 'Europe/Moscow' },
  // Africa
  { id: 'AFRICA_CASABLANCA', label: 'Casablanca', graph: 'Morocco Standard Time', calendar: 'Africa/Casablanca' },
  { id: 'AFRICA_LAGOS', label: 'Lagos', graph: 'W. Central Africa Standard Time', calendar: 'Africa/Lagos' },
  { id: 'AFRICA_JOHANNESBURG', label: 'Johannesburg', graph: 'South Africa Standard Time', calendar: 'Africa/Johannesburg' },
  { id: 'AFRICA_CAIRO', label: 'Cairo', graph: 'Egypt Standard Time', calendar: 'Africa/Cairo' },
  { id: 'AFRICA_NAIROBI', label: 'Nairobi', graph: 'E. Africa Standard Time', calendar: 'Africa/Nairobi' },
  // Middle East
  { id: 'ASIA_JERUSALEM', label: 'Jerusalem', graph: 'Israel Standard Time', calendar: 'Asia/Jerusalem' },
  { id: 'ASIA_RIYADH', label: 'Riyadh', graph: 'Arab Standard Time', calendar: 'Asia/Riyadh' },
  { id: 'ASIA_BAGHDAD', label: 'Baghdad', graph: 'Arabic Standard Time', calendar: 'Asia/Baghdad' },
  { id: 'ASIA_DUBAI', label: 'Dubai', graph: 'Arabian Standard Time', calendar: 'Asia/Dubai' },
  { id: 'ASIA_TEHRAN', label: 'Tehran', graph: 'Iran Standard Time', calendar: 'Asia/Tehran' },
  // Asia
  { id: 'ASIA_KABUL', label: 'Kabul', graph: 'Afghanistan Standard Time', calendar: 'Asia/Kabul' },
  { id: 'ASIA_KARACHI', label: 'Karachi', graph: 'Pakistan Standard Time', calendar: 'Asia/Karachi' },
  { id: 'ASIA_KOLKATA', label: 'Kolkata', graph: 'India Standard Time', calendar: 'Asia/Kolkata' },
  { id: 'ASIA_KATHMANDU', label: 'Kathmandu', graph: 'Nepal Standard Time', calendar: 'Asia/Kathmandu' },
  { id: 'ASIA_DHAKA', label: 'Dhaka', graph: 'Bangladesh Standard Time', calendar: 'Asia/Dhaka' },
  { id: 'ASIA_YANGON', label: 'Yangon', graph: 'Myanmar Standard Time', calendar: 'Asia/Yangon' },
  { id: 'ASIA_BANGKOK', label: 'Bangkok', graph: 'SE Asia Standard Time', calendar: 'Asia/Bangkok' },
  { id: 'ASIA_SINGAPORE', label: 'Singapore', graph: 'Singapore Standard Time', calendar: 'Asia/Singapore' },
  { id: 'ASIA_SHANGHAI', label: 'Shanghai', graph: 'China Standard Time', calendar: 'Asia/Shanghai' },
  { id: 'ASIA_TAIPEI', label: 'Taipei', graph: 'Taipei Standard Time', calendar: 'Asia/Taipei' },
  { id: 'ASIA_SEOUL', label: 'Seoul', graph: 'Korea Standard Time', calendar: 'Asia/Seoul' },
  { id: 'ASIA_TOKYO', label: 'Tokyo', graph: 'Tokyo Standard Time', calendar: 'Asia/Tokyo' },
  // Oceania
  { id: 'AUSTRALIA_PERTH', label: 'Perth', graph: 'W. Australia Standard Time', calendar: 'Australia/Perth' },
  { id: 'AUSTRALIA_DARWIN', label: 'Darwin', graph: 'AUS Central Standard Time', calendar: 'Australia/Darwin' },
  { id: 'AUSTRALIA_ADELAIDE', label: 'Adelaide', graph: 'Cen. Australia Standard Time', calendar: 'Australia/Adelaide' },
  { id: 'AUSTRALIA_BRISBANE', label: 'Brisbane', graph: 'E. Australia Standard Time', calendar: 'Australia/Brisbane' },
  { id: 'AUSTRALIA_SYDNEY', label: 'Sydney', graph: 'AUS Eastern Standard Time', calendar: 'Australia/Sydney' },
  { id: 'AUSTRALIA_HOBART', label: 'Hobart', graph: 'Tasmania Standard Time', calendar: 'Australia/Hobart' },
  { id: 'PACIFIC_AUCKLAND', label: 'Auckland', graph: 'New Zealand Standard Time', calendar: 'Pacific/Auckland' },
  { id: 'PACIFIC_CHATHAM', label: 'Chatham Islands', graph: 'Chatham Islands Standard Time', calendar: 'Pacific/Chatham' },
  { id: 'PACIFIC_FIJI', label: 'Fiji', graph: 'Fiji Standard Time', calendar: 'Pacific/Fiji' },
  { id: 'PACIFIC_SAMOA', label: 'Samoa', graph: 'Samoa Standard Time', calendar: 'Pacific/Apia' },
  { id: 'PACIFIC_TONGA', label: 'Tonga', graph: 'Tonga Standard Time', calendar: 'Pacific/Tongatapu' },
  { id: 'PACIFIC_KIRITIMATI', label: 'Line Islands (Kiritimati)', graph: 'Line Islands Standard Time', calendar: 'Pacific/Kiritimati' },
];

export const DEFAULT_TIMEZONE_ID = 'UTC';

const GRAPH_TO_IANA = new Map(TIMEZONE_OPTIONS.map((option) => [option.graph, option.calendar]));

export const resolveCalendarTimeZone = (graphTimeZone?: string | null) => {
  if (!graphTimeZone) return 'UTC';
  if (GRAPH_TO_IANA.has(graphTimeZone)) {
    return GRAPH_TO_IANA.get(graphTimeZone) ?? 'UTC';
  }
  if (graphTimeZone.includes('/')) {
    return graphTimeZone;
  }
  return 'UTC';
};
