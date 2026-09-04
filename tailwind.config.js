/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#F97316', // Warm Orange
          hover: '#EA580C', // Darker Orange
          muted: '#FED7AA', // Light Orange
        },
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#F9FAFB', // gray-50
        },
        content: {
          DEFAULT: '#1F2937', // Deep Charcoal (gray-800)
          muted: '#6B7280', // Neutral Gray (gray-500)
          inverse: '#FFFFFF',
        },
        border: {
          DEFAULT: '#E5E7EB', // Light neutral gray (gray-200)
          hover: '#D1D5DB', // gray-300
        },
        status: {
          success: '#059669', // emerald-600
          warning: '#F59E0B', // amber-500
          danger: '#DC2626', // red-600
          info: '#3B82F6', // blue-500
        }
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
