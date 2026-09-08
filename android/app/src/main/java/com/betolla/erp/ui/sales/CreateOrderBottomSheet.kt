package com.betolla.erp.ui.sales

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import com.betolla.erp.R
import com.betolla.erp.data.model.Lead
import com.betolla.erp.data.model.Order
import com.betolla.erp.data.model.OrderItem
import com.betolla.erp.data.model.Product
import com.betolla.erp.data.storage.LeadRepository
import com.betolla.erp.data.storage.SessionManager
import com.betolla.erp.databinding.BottomSheetCreateOrderBinding
import androidx.core.content.ContextCompat
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.google.android.material.button.MaterialButton
import java.net.URLEncoder
import java.util.UUID

class CreateOrderBottomSheet(
    private val lead: Lead,
    private val onOrderCreated: () -> Unit
) : BottomSheetDialogFragment() {

    private var _binding: BottomSheetCreateOrderBinding? = null
    private val binding get() = _binding!!
    private lateinit var leadRepository: LeadRepository
    private var products: List<Product> = emptyList()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = BottomSheetCreateOrderBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        leadRepository = LeadRepository(requireContext())
        products = leadRepository.getProducts()

        binding.tvOrderCustomerInfo.text = "${lead.name} (${lead.phone})"
        binding.etDeliveryCity.setText(lead.city)
        binding.etDeliveryAddress.setText(lead.address)

        buildProductRows()
        updateTotalCalculation()

        binding.btnSubmitOrder.setOnClickListener {
            val order = createOrderObject()
            if (order != null) {
                leadRepository.saveOrder(order)
                Toast.makeText(requireContext(), getString(R.string.order_created_success), Toast.LENGTH_SHORT).show()
                onOrderCreated()
                dismiss()
            }
        }

        binding.btnShareWhatsappInvoice.setOnClickListener {
            val order = createOrderObject()
            if (order != null) {
                leadRepository.saveOrder(order)
                shareViaWhatsapp(order)
                onOrderCreated()
                dismiss()
            }
        }
    }

    private fun buildProductRows() {
        val container = binding.layoutProductCatalog
        container.removeAllViews()

        val isArabic = SessionManager(requireContext()).getLanguage() == "ar"

        for (product in products) {
            val card = LinearLayout(requireContext()).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { setMargins(0, 8, 0, 8) }
                setBackgroundResource(R.drawable.bg_quick_chip)
                setPadding(24, 20, 24, 20)
                gravity = Gravity.CENTER_VERTICAL
            }

            val textContainer = LinearLayout(requireContext()).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }

            val tvTitle = TextView(requireContext()).apply {
                text = product.getDisplayName(isArabic)
                setTextColor(ContextCompat.getColor(requireContext(), R.color.text_primary))
                textSize = 14f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
            }

            val tvPrice = TextView(requireContext()).apply {
                text = "${product.sku} • ${String.format("%.3f", product.priceJd)} JD"
                setTextColor(ContextCompat.getColor(requireContext(), R.color.accent_light))
                textSize = 12f
                setPadding(0, 4, 0, 0)
            }

            textContainer.addView(tvTitle)
            textContainer.addView(tvPrice)

            val stepperContainer = LinearLayout(requireContext()).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }

            val btnSize = (38 * resources.displayMetrics.density).toInt()

            val btnMinus = MaterialButton(requireContext(), null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
                text = "−"
                setTextColor(ContextCompat.getColor(requireContext(), R.color.accent))
                textSize = 18f
                cornerRadius = (19 * resources.displayMetrics.density).toInt()
                layoutParams = LinearLayout.LayoutParams(btnSize, btnSize)
                insetTop = 0
                insetBottom = 0
                setPadding(0, 0, 0, 0)
                strokeColor = ContextCompat.getColorStateList(requireContext(), R.color.border)
                strokeWidth = (1 * resources.displayMetrics.density).toInt()
            }

            val tvQty = TextView(requireContext()).apply {
                text = product.selectedQty.toString()
                setTextColor(ContextCompat.getColor(requireContext(), R.color.text_primary))
                textSize = 16f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                setPadding(20, 0, 20, 0)
            }

            val btnPlus = MaterialButton(requireContext(), null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
                text = "+"
                setTextColor(ContextCompat.getColor(requireContext(), R.color.primary))
                textSize = 18f
                cornerRadius = (19 * resources.displayMetrics.density).toInt()
                layoutParams = LinearLayout.LayoutParams(btnSize, btnSize)
                insetTop = 0
                insetBottom = 0
                setPadding(0, 0, 0, 0)
                strokeColor = ContextCompat.getColorStateList(requireContext(), R.color.primary)
                strokeWidth = (1 * resources.displayMetrics.density).toInt()
            }

            btnMinus.setOnClickListener {
                if (product.selectedQty > 0) {
                    product.selectedQty--
                    tvQty.text = product.selectedQty.toString()
                    updateTotalCalculation()
                }
            }

            btnPlus.setOnClickListener {
                product.selectedQty++
                tvQty.text = product.selectedQty.toString()
                updateTotalCalculation()
            }

            stepperContainer.addView(btnMinus)
            stepperContainer.addView(tvQty)
            stepperContainer.addView(btnPlus)

            card.addView(textContainer)
            card.addView(stepperContainer)
            container.addView(card)
        }
    }

    private fun updateTotalCalculation() {
        var total = 0.0
        for (p in products) {
            total += p.priceJd * p.selectedQty
        }
        binding.tvOrderTotalPrice.text = String.format("%.3f JD", total)
    }

    private fun createOrderObject(): Order? {
        val selectedItems = mutableListOf<OrderItem>()
        var total = 0.0
        for (p in products) {
            if (p.selectedQty > 0) {
                val sub = p.priceJd * p.selectedQty
                selectedItems.add(OrderItem(product = p, quantity = p.selectedQty, subtotal = sub))
                total += sub
            }
        }

        if (selectedItems.isEmpty()) {
            Toast.makeText(requireContext(), getString(R.string.no_products_selected), Toast.LENGTH_SHORT).show()
            return null
        }

        val city = binding.etDeliveryCity.text?.toString()?.trim().orEmpty()
        val address = binding.etDeliveryAddress.text?.toString()?.trim().orEmpty()

        val paymentMethod = when {
            binding.rbCliq.isChecked -> "CliQ"
            binding.rbInstallment.isChecked -> "Installment"
            else -> "COD"
        }

        return Order(
            id = "ORD-${UUID.randomUUID().toString().substring(0, 6).uppercase()}",
            customerName = lead.name,
            customerPhone = lead.phone,
            deliveryCity = if (city.isNotEmpty()) city else lead.city,
            deliveryAddress = if (address.isNotEmpty()) address else lead.address,
            items = selectedItems,
            totalJd = total,
            paymentMethod = paymentMethod
        )
    }

    private fun shareViaWhatsapp(order: Order) {
        val invoice = StringBuilder().apply {
            append("🌟 *فاتورة طلبية جديدة - بيفولا كوزمتكس* 🌟\n\n")
            append("👤 *العميل:* ${order.customerName}\n")
            append("📞 *الهاتف:* ${order.customerPhone}\n")
            append("📍 *العنوان:* ${order.deliveryCity} - ${order.deliveryAddress}\n\n")
            append("📦 *المنتجات المطلوبة:*\n")
            for (item in order.items) {
                append("• ${item.product.nameAr} × ${item.quantity} = ${String.format("%.3f", item.subtotal)} د.أ\n")
            }
            append("\n💳 *طريقة الدفع:* ${order.paymentMethod}\n")
            append("💰 *الإجمالي المطلوب:* ${String.format("%.3f", order.totalJd)} د.أ\n\n")
            append("شكراً لاختياركم بيفولا كوزمتكس ✨")
        }.toString()

        val cleanPhone = order.customerPhone.replace("[^0-9]".toRegex(), "")
        val intlPhone = if (cleanPhone.startsWith("0")) "962" + cleanPhone.substring(1) else cleanPhone

        val url = "https://wa.me/$intlPhone?text=" + URLEncoder.encode(invoice, "UTF-8")
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            setPackage("com.whatsapp")
        }
        try {
            startActivity(intent)
        } catch (e: Exception) {
            val fallbackIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            startActivity(fallbackIntent)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}