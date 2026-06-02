import { defineConfig } from 'vite'  
import react from '@vitejs/plugin-react'  
  
export default defineConfig({  
  plugins: [react()],  
  base: './', // Para que funcione en subdirectorios si es necesario  
})