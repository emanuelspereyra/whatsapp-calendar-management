CREATE TYPE "UserRole" AS ENUM ('admin', 'viewer');

ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'viewer';
