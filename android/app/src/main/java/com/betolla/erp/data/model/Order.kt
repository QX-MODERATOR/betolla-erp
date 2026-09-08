package com.betolla.erp.data.model

data class Order(
    val id: String,
    val customerName: String,
    val customerPhone: String,
    val deliveryCity: String,
    val deliveryAddress: String,
    val items: List<OrderItem>,
    val totalJd: Double,
    val paymentMethod: String,
    val status: String = "pending"
)

data class OrderItem(
    val product: Product,
    val quantity: Int,
    val subtotal: Double
)