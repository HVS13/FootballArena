export type WeatherCondition = 'clear' | 'overcast' | 'rain' | 'snow' | 'storm';

export type PitchCondition = 'pristine' | 'good' | 'worn' | 'heavy';

export type EnvironmentState = {
  weather: WeatherCondition;
  pitch: PitchCondition;
  temperatureC: number;
  wind: {
    x: number;
    y: number;
  };
};

export const DEFAULT_ENVIRONMENT: EnvironmentState = {
  weather: 'clear',
  pitch: 'good',
  temperatureC: 18,
  wind: { x: 0, y: 0 }
};
