import { loadConfig } from './config.js';
import { buildApp } from './app.js';
const config=loadConfig();
const app=await buildApp(config);
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close().then(()=>process.exit(0));});
try{await app.listen({host:config.HOST,port:config.PORT});}catch{app.log.error('API startup failed');await app.close();process.exitCode=1;}
