package com.betolla.erp.data.model

data class Lead(
    val id: String,
    val name: String,
    val phone: String,
    val city: String,
    val address: String,
    val scheduledTime: String,
    val lastCall: String,
    var totalCalls: Int,
    var notes: String = "",
    var nextCallDate: String = "",
    val priority: String = "high"
)