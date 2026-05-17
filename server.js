import express from "express";

const app = express();
const port = process.env.PORT || 3000;

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "ponto-2-integrations-bridge",
    timestamp: new Date().toISOString()
  });
});

function canvaCallback(env) {
  return (req, res) => {
    const { code, state, error, error_description } = req.query;

    if (error) {
      console.log(JSON.stringify({
        event: "canva_oauth_error",
        env,
        error,
        error_description,
        timestamp: new Date().toISOString()
      }));

      return res.status(400).json({
        status: "oauth_error",
        env,
        error,
        error_description
      });
    }

    if (!code || !state) {
      return res.status(400).json({
        status: "missing_code_or_state",
        env,
        message: "Callback route is active, but code/state were not provided."
      });
    }

    console.log(JSON.stringify({
      event: "canva_oauth_callback_received",
      env,
      has_code: Boolean(code),
      has_state: Boolean(state),
      timestamp: new Date().toISOString()
    }));

    return res.json({
      status: "callback_received",
      env,
      message: "Authorization code received. Token exchange handler pending."
    });
  };
}

app.get("/api/canva/oauth/dev/callback", canvaCallback("dev"));
app.get("/api/canva/oauth/stage/callback", canvaCallback("stage"));
app.get("/api/canva/oauth/callback", canvaCallback("prod"));

app.listen(port, "0.0.0.0", () => {
  console.log(`ponto-2-integrations-bridge listening on ${port}`);
});
