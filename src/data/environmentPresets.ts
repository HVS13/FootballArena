import { EnvironmentState } from '../domain/environmentTypes';

export type EnvironmentPreset = {
  id: string;
  name: string;
  description: string;
  environment: EnvironmentState;
};

const toRadians = (deg: number) => (deg * Math.PI) / 180;

const windFrom = (speed: number, directionDeg: number) => ({
  x: Number((speed * Math.cos(toRadians(directionDeg))).toFixed(2)),
  y: Number((speed * Math.sin(toRadians(directionDeg))).toFixed(2))
});

export const ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
  {
    id: 'clear_calm',
    name: 'Clear Calm',
    description: 'Stable conditions with light wind and a good pitch.',
    environment: {
      weather: 'clear',
      pitch: 'good',
      temperatureC: 18,
      wind: windFrom(1.2, 120)
    }
  },
  {
    id: 'overcast_breeze',
    name: 'Overcast Breeze',
    description: 'Cooler air with a steady breeze across the pitch.',
    environment: {
      weather: 'overcast',
      pitch: 'good',
      temperatureC: 14,
      wind: windFrom(3.8, 210)
    }
  },
  {
    id: 'summer_heat',
    name: 'Summer Heat',
    description: 'Higher temperatures increase fatigue, pitch remains fast.',
    environment: {
      weather: 'clear',
      pitch: 'pristine',
      temperatureC: 31,
      wind: windFrom(1.5, 60)
    }
  },
  {
    id: 'humid_night',
    name: 'Humid Night',
    description: 'Warm, heavy air with moderate wind and a slick surface.',
    environment: {
      weather: 'overcast',
      pitch: 'worn',
      temperatureC: 27,
      wind: windFrom(2.5, 300)
    }
  },
  {
    id: 'rainy_evening',
    name: 'Rainy Evening',
    description: 'Rain slicks the pitch and adds weight to the ball.',
    environment: {
      weather: 'rain',
      pitch: 'good',
      temperatureC: 12,
      wind: windFrom(3.2, 170)
    }
  },
  {
    id: 'storm_warning',
    name: 'Storm Warning',
    description: 'Strong wind and heavy rain disrupt long passes.',
    environment: {
      weather: 'storm',
      pitch: 'worn',
      temperatureC: 10,
      wind: windFrom(6.5, 250)
    }
  },
  {
    id: 'snowy_day',
    name: 'Snowy Day',
    description: 'Snow slows movement and makes control harder.',
    environment: {
      weather: 'snow',
      pitch: 'heavy',
      temperatureC: -1,
      wind: windFrom(2.8, 340)
    }
  },
  {
    id: 'winter_frost',
    name: 'Winter Frost',
    description: 'Cold, firm air with a good pitch but low temps.',
    environment: {
      weather: 'overcast',
      pitch: 'good',
      temperatureC: 2,
      wind: windFrom(2.2, 40)
    }
  },
  {
    id: 'windy_coast',
    name: 'Windy Coast',
    description: 'Persistent crosswind challenges switching play.',
    environment: {
      weather: 'clear',
      pitch: 'good',
      temperatureC: 16,
      wind: windFrom(5.4, 90)
    }
  },
  {
    id: 'wet_heavy_pitch',
    name: 'Wet Heavy Pitch',
    description: 'Heavy surface with rain, heavy touches, and slower pace.',
    environment: {
      weather: 'rain',
      pitch: 'heavy',
      temperatureC: 8,
      wind: windFrom(2.6, 200)
    }
  },
  {
    id: 'showcase_pristine',
    name: 'Showcase Pristine',
    description: 'Perfect pitch for quick circulation and sharp movement.',
    environment: {
      weather: 'clear',
      pitch: 'pristine',
      temperatureC: 20,
      wind: windFrom(1.8, 10)
    }
  },
  {
    id: 'gritty_worn',
    name: 'Gritty Worn',
    description: 'Worn surface reduces acceleration and ball bounce.',
    environment: {
      weather: 'overcast',
      pitch: 'worn',
      temperatureC: 11,
      wind: windFrom(2.9, 130)
    }
  },
  {
    id: 'cup_final',
    name: 'Cup Final',
    description: 'Mild evening with a flawless pitch and low wind.',
    environment: {
      weather: 'clear',
      pitch: 'pristine',
      temperatureC: 19,
      wind: windFrom(1.1, 85)
    }
  },
  {
    id: 'derby_day',
    name: 'Derby Day',
    description: 'Cool and loud with a slightly worn pitch.',
    environment: {
      weather: 'overcast',
      pitch: 'worn',
      temperatureC: 13,
      wind: windFrom(3.1, 150)
    }
  },
  {
    id: 'high_altitude',
    name: 'High Altitude',
    description: 'Thin air with stronger wind and a fast pitch.',
    environment: {
      weather: 'clear',
      pitch: 'good',
      temperatureC: 9,
      wind: windFrom(4.8, 20)
    }
  },
  {
    id: 'training_ground',
    name: 'Training Ground',
    description: 'Controlled conditions for clean passing sequences.',
    environment: {
      weather: 'clear',
      pitch: 'good',
      temperatureC: 17,
      wind: windFrom(0.6, 180)
    }
  }
];
