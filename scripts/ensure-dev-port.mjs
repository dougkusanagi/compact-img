import { createServer } from "node:net";

const server = createServer();

server.once("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error("A porta 3000 ja esta em uso. Encerre a outra instancia de desenvolvimento antes de iniciar o desktop:dev.");
  } else {
    console.error("Nao foi possivel verificar a porta 3000:", error);
  }
  process.exitCode = 1;
});

server.listen(3000, "::", () => server.close());
