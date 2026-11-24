import { app } from "./app.js";
import { BUILD_ID } from "./db.js";

const port = Number(process.env.PORT ?? 5173);
app.listen(port, () => console.log(`EnrollmentNow ${BUILD_ID} listening on http://localhost:${port}`));
