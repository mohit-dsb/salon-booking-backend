import { env } from "./environment";
import { Application } from "express";
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const swaggerOptions: swaggerJSDoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Your API",
      version: "1.0.0",
      description: "A scalable Express.js API with TypeScript and MongoDB",
      contact: {
        name: "Mohit Mourya",
        email: "mohit.mourya@designingsolutions.co.in",
      },
    },
    servers: [
      {
        url: env.NODE_ENV === "production" ? "https://your-api.com/api/v1" : `http://localhost:${env.PORT}/api/v1`,
        description: env.NODE_ENV === "production" ? "Production" : "Development",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./src/routes/**/*.ts", "./src/controllers/**/*.ts"],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

export const setupSwagger = (app: Application) => {
  if (env.SWAGGER_ENABLED) {
    app.use(
      "/api-docs",
      swaggerUi.serve,
      swaggerUi.setup(swaggerSpec, {
        explorer: true,
        customCss: ".swagger-ui .topbar { display: none }",
        customSiteTitle: "Your API Documentation",
      })
    );
  }
};
