import { app } from './app.js';

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`bridge listening on :${port}`);
});
