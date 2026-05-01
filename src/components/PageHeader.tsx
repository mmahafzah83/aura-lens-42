import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  question: string;
  processLogic: string;
  children?: React.ReactNode;
}

const PageHeader = ({ icon: Icon, title, question, processLogic, children }: PageHeaderProps) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4 }}
    className="space-y-1.5 overflow-hidden"
  >
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <span className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">{title}</span>
      {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
    </div>
    <h1
      className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight leading-tight break-words"
      style={{ fontFamily: "var(--font-display)" }}
    >
      {question}
    </h1>
    <p className="text-sm text-muted-foreground/60 tracking-wide break-words">{processLogic}</p>
  </motion.div>
);

export default PageHeader;
