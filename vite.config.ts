import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],build:{outDir:'dist/client',target:'es2020'},server:{host:'0.0.0.0',port:Number(process.env.VITE_PORT)||4317,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:4318',changeOrigin:false,configure(proxy){proxy.on('proxyReq',(outgoing,incoming)=>{outgoing.setHeader('X-Dev-Original-Host',incoming.headers.host||'localhost:4317');});}}}}});
