import Koa = require("koa");
import { phpFpm } from "./middlewares/phpFpmMiddleware";
import { PHP_CONFIG } from "./phpConfig";

const HOST = "127.0.0.1";
const PORT = 8000;

const app = new Koa();

app.use(phpFpm({
    ...PHP_CONFIG,
    documentRoot: "/var/www/phpmyadmin"
}));

app.listen(PORT, HOST, () => {
    console.log(`Serving phpMyAdmin at http://${HOST}:${PORT}...`);
});
