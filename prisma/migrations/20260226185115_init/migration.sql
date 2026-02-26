-- CreateTable
CREATE TABLE "price_records" (
    "id" TEXT NOT NULL,
    "coin_id" TEXT NOT NULL,
    "symbol" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_records_coin_id_fetched_at_idx" ON "price_records"("coin_id", "fetched_at");

-- CreateIndex
CREATE INDEX "price_records_coin_id_currency_idx" ON "price_records"("coin_id", "currency");
