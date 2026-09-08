package com.betolla.erp.data.model

data class User(
    val username: String,
    val fullName: String,
    val role: String,
    val token: String? = null
) {
    val isAdmin: Boolean get() = role.equals("admin", ignoreCase = true)
    val isSalesRep: Boolean get() = role.equals("sales_rep", ignoreCase = true)
}