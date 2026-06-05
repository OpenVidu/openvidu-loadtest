FROM maven:3.9.14-eclipse-temurin-25-alpine AS build
WORKDIR /workspace

# Copy only the POM first to cache Maven dependencies layer
COPY pom.xml ./

# Pre-download dependencies to leverage Docker layer cache
RUN mvn -B -DskipTests dependency:go-offline

# Copy the source code and build the artifact
COPY src ./src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:25-jre-alpine
WORKDIR /app

# Copy the built jar from the builder stage
COPY --from=build /workspace/target/*.jar app.jar

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
