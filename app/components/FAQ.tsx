"use client";
import React, { useState } from "react";
import styles from "./FAQ.module.css";

interface FAQItem {
  question: string;
  answer: string | React.ReactNode;
}

const faqs: FAQItem[] = [
  {
    question: "What is Cardify?",
    answer: "Cardify transforms your on-chain activity into beautiful, collectible NFT trading cards. Each card displays your wallet's stats including transactions, NFTs, and achievements on Base blockchain.",
  },
  {
    question: "How do I mint my Cardified badge?",
    answer: (
      <>
        <ol style={{ marginTop: "0.5rem", paddingLeft: "1.25rem", lineHeight: "1.6" }}>
          <li>Connect your wallet using the button in the top right</li>
          <li>Your stats will be automatically fetched from Base blockchain</li>
          <li>Check if you meet the tier requirements (see tier requirements below)</li>
          <li>Click the &quot;Mint NFT&quot; or &quot;Upgrade to New Tier&quot; button</li>
          <li>Confirm the transaction in your wallet</li>
          <li>Your NFT card will be generated and minted to your wallet!</li>
        </ol>
      </>
    ),
  },
  {
    question: "What are the tier requirements?",
    answer: (
      <>
        <div style={{ marginTop: "0.5rem", lineHeight: "1.6" }}>
          <strong>Tier 1 (Goat):</strong> 1+ transactions<br />
          <strong>Tier 2 (Fox):</strong> 12+ transactions<br />
          <strong>Tier 3 (Tiger):</strong> 23+ transactions<br />
          <strong>Tier 4 (Dragon):</strong> 32+ transactions<br />
          <strong>Tier 5 (Phoenix):</strong> 105+ transactions + Basename<br />
          <br />
          <em>All transactions must be on Base blockchain.</em>
        </div>
      </>
    ),
  },
  {
    question: "Can I upgrade my NFT to a higher tier?",
    answer: "Yes! When you qualify for a higher tier, you can upgrade your card. Click the 'Upgrade to New Tier' button. This will burn your old NFT and mint a new one with your current tier. Your new card will reflect your latest on-chain achievements.",
  },
  {
    question: "What stats are shown on my card?",
    answer: (
      <>
        <div style={{ marginTop: "0.5rem", lineHeight: "1.6" }}>
          Your NFT card displays:
          <ul style={{ marginTop: "0.5rem", paddingLeft: "1.25rem" }}>
            <li><strong>Transactions:</strong> Total number of transactions on Base</li>
            <li><strong>NFTs:</strong> Number of NFTs you own</li>
            <li><strong>Basename:</strong> Your Basename (if you have one, Tier 5 only)</li>
            <li><strong>Wallet Address:</strong> Your shortened wallet address at the bottom</li>
          </ul>
        </div>
      </>
    ),
  },
  {
    question: "What is a Basename?",
    answer: "Basename is a human-readable name for your wallet on Base (like ENS for Ethereum). To get Tier 5 (Phoenix), you need to have a registered Basename in addition to meeting the transaction requirements. Learn more at base.org.",
  },
  {
    question: "Are my stats frozen when I mint?",
    answer: "Yes! When you mint your NFT, your current stats are permanently saved to IPFS and frozen in the metadata. This creates a snapshot of your achievements at that moment. Your actual wallet activity can continue to grow, and you can mint a new card when you reach the next tier.",
  },
  {
    question: "How much does it cost to mint?",
    answer: "Minting is FREE! You only pay the gas fee for the transaction on Base blockchain. Base has very low gas fees, typically just a few cents.",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className={styles.faqSection}>
      <div className={styles.faqContainer}>
        <h2 className={styles.faqTitle}>Frequently Asked Questions</h2>
        <p className={styles.faqSubtitle}>
          Everything you need to know about minting and upgrading your Cardified badge
        </p>

        <div className={styles.faqList}>
          {faqs.map((faq, index) => (
            <div key={index} className={styles.faqItem}>
              <button
                className={`${styles.faqQuestion} ${
                  openIndex === index ? styles.faqQuestionOpen : ""
                }`}
                onClick={() => toggleFAQ(index)}
              >
                <span>{faq.question}</span>
                <span className={styles.faqIcon}>
                  {openIndex === index ? "−" : "+"}
                </span>
              </button>
              {openIndex === index && (
                <div className={styles.faqAnswer}>
                  {typeof faq.answer === "string" ? (
                    <p>{faq.answer}</p>
                  ) : (
                    faq.answer
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

