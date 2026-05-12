import 'dotenv/config';
import App from "./app";

const appInstance = new App();
const app = appInstance.app;

if (process.env.NODE_ENV !== 'production') {
  appInstance.listen();
}

export default app;
