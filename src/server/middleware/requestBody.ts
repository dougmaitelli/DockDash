import express, { Router } from "express";

const requestBody = Router();

// Parse file saves first so the general API limit cannot reject their bodies.
requestBody.put("/api/services/:id/files/content", express.json({ limit: "10mb" }));
requestBody.use(express.json({ limit: "100kb" }));

export default requestBody;
