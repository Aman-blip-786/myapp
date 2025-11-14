import express from "express";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("Backend is running!");
});

app.listen(3001, () => {
  console.log("Server running on port 3001");
});
