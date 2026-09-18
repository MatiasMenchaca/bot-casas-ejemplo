import { app } from "./app.js";

// El árbitro del ejercicio usa el puerto 3000 por defecto.
const port = 3000;

// Este archivo abre el puerto y deja el proceso esperando solicitudes HTTP.
app.listen(port, () => {
  // El callback se ejecuta cuando el servidor ya está escuchando.
  console.log(`Bot de casas escuchando en http://localhost:${port}`);
});
