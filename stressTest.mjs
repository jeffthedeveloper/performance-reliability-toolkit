import cluster from 'cluster';
import http from 'http';
import https from 'https';
import fetch from 'node-fetch';
import { cpus } from 'os';

const TOTAL_REQUESTS = 500000;
const URL = "https://www.gruporochacavalcante.com.br/index";
const CONCURRENCY_LIMIT = 1000;
const REPORT_INTERVAL = 1000;

if (cluster.isPrimary) {
  console.log(`🔥 Iniciando teste de estresse otimizado`);
  console.log(`🖥️  Processadores: ${cpus().length} núcleos`);
  console.log(`🎯 Alvo: ${URL}`);
  console.log(`📊 Requisições totais: ${TOTAL_REQUESTS}\n`);

  const startTime = Date.now();
  let completed = 0;
  let successes = 0;
  let fails = 0;

  // Monitor de recursos
  const monitor = setInterval(() => {
    const memory = process.memoryUsage();
    console.log(`📊 Memória: ${(memory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
  }, 5000);

  // Criar workers
  for (let i = 0; i < cpus().length; i++) {
    const worker = cluster.fork();
    const requestsPerWorker = Math.ceil(TOTAL_REQUESTS / cpus().length);

    worker.send({
      url: URL,
      requests: requestsPerWorker,
      workerId: i
    });

    worker.on('message', (msg) => {
      completed += msg.completed;
      successes += msg.successes;
      fails += msg.fails;

      process.stdout.write(`\r📈 Progresso: ${completed}/${TOTAL_REQUESTS} ` +
        `(${((completed/TOTAL_REQUESTS)*100).toFixed(1)}%) | ` +
        `✅: ${successes} | ❌: ${fails}`
      );
    });
  }

  cluster.on('exit', (worker) => {
    if (Object.keys(cluster.workers).length === 0) {
      clearInterval(monitor);
      const totalTime = (Date.now() - startTime) / 1000;

      console.log("\n\n=== 🏁 TESTE CONCLUÍDO ===");
      console.log(`⏱️  Tempo total: ${totalTime.toFixed(2)}s`);
      console.log(`🚀 RPS: ${(TOTAL_REQUESTS/totalTime).toFixed(2)}`);
      console.log(`💾 Memória máxima: ${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)}MB`);
    }
  });

} else {
  process.on('message', async (data) => {
    const { url, requests } = data;

    // Criar agente HTTP/HTTPS apropriado
    const isHttps = url.startsWith('https');
    const agent = isHttps
      ? new https.Agent({ keepAlive: true, maxSockets: 200 })
      : new http.Agent({ keepAlive: true, maxSockets: 200 });

    let successes = 0;
    let fails = 0;
    let completed = 0;
    let lastReported = 0;

    const makeRequest = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
          agent,
          signal: controller.signal,
          headers: {
            'Connection': 'keep-alive',
            'User-Agent': 'StressTest/1.0'
          }
        });

        clearTimeout(timeoutId);
        response.status === 200 ? successes++ : fails++;
      } catch {
        fails++;
      } finally {
        completed++;
      }
    };

    // Executar requisições controladamente
    while (completed < requests) {
      const batchSize = Math.min(CONCURRENCY_LIMIT, requests - completed);
      const batch = Array(batchSize).fill().map(() => makeRequest());
      await Promise.all(batch);

      // Reportar progresso periodicamente
      if (completed - lastReported >= REPORT_INTERVAL) {
        process.send({
          completed: completed - lastReported,
          successes: successes,
          fails: fails
        });
        lastReported = completed;
        successes = 0;
        fails = 0;
      }
    }

    // Reportar quaisquer resultados restantes
    if (successes > 0 || fails > 0) {
      process.send({
        completed: successes + fails,
        successes: successes,
        fails: fails
      });
    }

    process.exit(0);
  });
}
