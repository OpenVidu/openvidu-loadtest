import request from "supertest";
import { startServer } from "../../src/server";
import type { Express } from 'express';

let app: Express;

beforeAll(async () => {
    process.env.APPLICATION_MODE = 'PRODUCTION';
    jest.resetModules();
    const result = await startServer();
    app = result.app;
});

test('should start the application', async () => {
    await request(app)
        .get('/instance/ping')
        .expect(200)
        .expect('Pong');
});
