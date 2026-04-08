import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Copy, Trash2, Check } from "lucide-react";
import BackButton from "../components/BackButton";
import { getCurrentUserAccount } from "@/lib/custom-auth";

export default function AccessCodes() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newCode, setNewCode] = useState("");
  const [newUses, setNewUses] = useState("1");
  const [copiedId, setCopiedId] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const currentUser = await getCurrentUserAccount();
    setUser(currentUser);
    
    if (currentUser?.role !== 'admin') {
      setLoading(false);
      return;
    }

    const allCodes = await base44.entities.AccessCode.list('-created_date');
    setCodes(allCodes);
    setLoading(false);
  };

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewCode(code);
  };

  const handleCreate = async () => {
    if (!newCode) return;

    await base44.entities.AccessCode.create({
      code: newCode.toUpperCase(),
      uses_remaining: parseInt(newUses),
      is_active: true
    });

    setNewCode("");
    setNewUses("1");
    loadData();
  };

  const handleDelete = async (id) => {
    await base44.entities.AccessCode.delete(id);
    loadData();
  };

  const copyToClipboard = (code, id) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-full bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-full bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-white text-xl font-bold mb-2">Access Denied</h1>
          <p className="text-gray-500">Admin access required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0a0a0f] pb-4">
      <div className="p-4 space-y-6">
        <BackButton />
        
        <div>
          <h1 className="text-white text-2xl font-bold">Access Codes</h1>
          <p className="text-gray-500 text-sm">Manage signup access codes</p>
        </div>

        {/* Create New Code */}
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-xl p-4 space-y-3">
          <h2 className="text-white font-semibold">Generate New Code</h2>
          
          <div className="flex gap-2">
            <Input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="CODE"
              className="bg-white/5 border-white/10 text-white font-mono"
            />
            <Button
              onClick={generateRandomCode}
              variant="outline"
              className="bg-white/5 border-white/10 text-white hover:bg-white/10"
            >
              Random
            </Button>
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Uses (-1 for unlimited)</label>
            <Input
              type="number"
              value={newUses}
              onChange={(e) => setNewUses(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
            />
          </div>

          <Button
            onClick={handleCreate}
            disabled={!newCode}
            className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Code
          </Button>
        </div>

        {/* Existing Codes */}
        <div className="space-y-2">
          <h2 className="text-white font-semibold">Existing Codes</h2>
          
          {codes.length === 0 ? (
            <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-xl p-8 text-center">
              <p className="text-gray-500">No access codes yet</p>
            </div>
          ) : (
            codes.map((code) => (
              <div
                key={code.id}
                className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-xl p-4 flex items-center justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-mono font-bold text-lg">{code.code}</span>
                    {!code.is_active && (
                      <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">
                        Expired
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 text-xs text-gray-500">
                    <span>Used: {code.times_used}</span>
                    <span>•</span>
                    <span>
                      Remaining: {code.uses_remaining === -1 ? '∞' : code.uses_remaining}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => copyToClipboard(code.code, code.id)}
                    size="icon"
                    variant="ghost"
                    className="text-gray-400 hover:text-white"
                  >
                    {copiedId === code.id ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    onClick={() => handleDelete(code.id)}
                    size="icon"
                    variant="ghost"
                    className="text-gray-400 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
