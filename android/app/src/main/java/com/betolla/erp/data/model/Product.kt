package com.betolla.erp.data.model

data class Product(
    val id: String,
    val sku: String,
    val nameEn: String,
    val nameAr: String,
    val priceJd: Double,
    val stockQty: Int,
    var selectedQty: Int = 0
) {
    fun getDisplayName(isArabic: Boolean): String = if (isArabic) nameAr else nameEn
}