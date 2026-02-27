-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- Insert legacy user for existing price_records
INSERT INTO "users" ("id", "email", "password") VALUES ('00000000-0000-0000-0000-000000000001', 'legacy@system.local', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');

-- AlterTable: add user_id as nullable first
ALTER TABLE "price_records" ADD COLUMN "user_id" TEXT;

-- Update existing rows to use legacy user
UPDATE "price_records" SET "user_id" = '00000000-0000-0000-0000-000000000001' WHERE "user_id" IS NULL;

-- Make user_id NOT NULL
ALTER TABLE "price_records" ALTER COLUMN "user_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "price_records" ADD CONSTRAINT "price_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "price_records_user_id_idx" ON "price_records"("user_id");
