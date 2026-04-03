/**
 * @file stressTest.mjs
 * @description Framework de validação de resiliência e mitigação de riscos de infraestrutura.
 * @version 2.0.0
 * @author Jefferson Firmino Mendes
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

class ResilienceEngine {
    constructor(config) {
        this.validateConfig(config);
        this.config = config;
        this.stats = {
            totalRequests: 0,
            successCount: 0,
            errorCount: 0,
            startTime: Date.now()
        };
    }

    validateConfig(config) {
        if (!config.targetUrl) throw new Error("URL de destino é obrigatória.");
        if (config.requestsPerSecond <= 0) throw new Error("Frequência de requisições deve ser positiva.");
    }

    async execute() {
        console.log(`[INFO] Iniciando validação de resiliência em: ${this.config.targetUrl}`);
        console.log(`[INFO] Carga configurada: ${this.config.requestsPerSecond} req/s`);

        const interval = 1000 / this.config.requestsPerSecond;

        setInterval(() => {
            this.dispatchRequest();
        }, interval);

        // Relatório de monitorização a cada 5 segundos
        setInterval(() => this.printStatus(), 5000);
    }

    dispatchRequest() {
        const url = new URL(this.config.targetUrl);
        const protocol = url.protocol === 'https:' ? https : http;
        
        const options = {
            method: 'GET', // Configurável para POST/PUT
            timeout: 5000, // Prevenção de thread hanging
            headers: {
                'User-Agent': 'Resilience-Toolkit-Senior-Validator/2.0',
                'Accept': 'application/json'
            }
        };

        const req = protocol.request(this.config.targetUrl, options, (res) => {
            this.stats.totalRequests++;
            if (res.statusCode >= 200 && res.statusCode < 300) {
                this.stats.successCount++;
            } else {
                this.stats.errorCount++;
            }
            res.resume(); // Consome o stream para libertar memória
        });

        req.on('error', (err) => {
            this.stats.totalRequests++;
            this.stats.errorCount++;
            this.logError(err);
        });

        req.on('timeout', () => {
            req.destroy();
            console.error('[WARN] Request Timeout - Possível saturação de recurso.');
        });

        req.end();
    }

    logError(err) {
        // Implementação de logging estruturado (ex: winston ou pino)
        // Aqui simulado para manter portabilidade
        // console.error(`[ERROR] Falha na requisição: ${err.message}`);
    }

    printStatus() {
        const uptime = ((Date.now() - this.stats.startTime) / 1000).toFixed(2);
        console.table({
            'Target': this.config.targetUrl,
            'Uptime (s)': uptime,
            'Total': this.stats.totalRequests,
            'Sucesso': this.stats.successCount,
            'Falhas': this.stats.errorCount,
            'Availability %': ((this.stats.successCount / this.stats.totalRequests) * 100).toFixed(2)
        });
    }
}

// Configuração centralizada
const runtimeConfig = {
    targetUrl: process.env.TARGET_URL || 'http://localhost:3000',
    requestsPerSecond: parseInt(process.env.REQ_PER_SEC) || 10,
    payloadSize: '1kb'
};

const engine = new ResilienceEngine(runtimeConfig);
engine.execute().catch(err => {
    console.error(`[FATAL] Falha crítica no motor de testes: ${err.message}`);
    process.exit(1);
});
